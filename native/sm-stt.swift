// sm-stt — macOS native speech-to-text sidecar for Static Meter (Electron).
//
// Uses Apple's on-device Speech framework (SFSpeechRecognizer) + AVAudioEngine
// to provide real-time, low-latency transcription — far snappier than the WASM
// Whisper fallback. It is spawned by the Electron main process and streams
// newline-delimited JSON to stdout:
//
//   {"type":"status","value":"ready"|"listening"|"denied"|"unavailable"|"error","msg":"…"}
//   {"type":"partial","text":"…"}      // interim hypothesis (live)
//   {"type":"final","text":"…"}        // a settled utterance
//
// Args:  sm-stt <locale>   e.g.  sm-stt fr-FR   (default en-US)
//
// Read stdin: a line "stop" cleanly stops; EOF / SIGTERM also stops.

import Foundation
import Speech
import AVFoundation

// ── JSON line output (thread-safe-ish, single writer) ───────────────────────
let stdoutQueue = DispatchQueue(label: "sm-stt.out")
func emit(_ obj: [String: String]) {
    stdoutQueue.async {
        if let data = try? JSONSerialization.data(withJSONObject: obj),
           let s = String(data: data, encoding: .utf8) {
            FileHandle.standardOutput.write(Data((s + "\n").utf8))
        }
    }
}

let localeId = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "en-US"

final class STT: NSObject, SFSpeechRecognizerDelegate {
    let recognizer: SFSpeechRecognizer?
    let audioEngine = AVAudioEngine()
    var request: SFSpeechAudioBufferRecognitionRequest?
    var task: SFSpeechRecognitionTask?
    var restarting = false
    // Silence-based finalization: SFSpeechRecognizer in continuous mode streams
    // partial results but rarely fires `isFinal`. We treat a ~0.9 s pause (the
    // partial text staying unchanged) as the end of an utterance and emit it.
    var lastPartial = ""
    var finalizeWork: DispatchWorkItem?
    let silenceMs = 900
    // CHRONIC-FIX: SFSpeechRecognizer silently stops a recognition task after
    // ~1 minute. If the speaker never pauses (no silence-finalize) the task hits
    // that limit and dies WITHOUT an error → the transcript freezes forever. A
    // watchdog force-restarts the cycle well before the limit so dictation never
    // dies during long sessions.
    var cycleStartedAt = Date()
    var watchdog: Timer?
    let maxCycleSec = 50.0

    override init() {
        recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeId)) ?? SFSpeechRecognizer()
        super.init()
    }

    func authorizeAndStart() {
        SFSpeechRecognizer.requestAuthorization { [weak self] auth in
            guard let self = self else { return }
            switch auth {
            case .authorized:
                guard let r = self.recognizer, r.isAvailable else {
                    emit(["type": "status", "value": "unavailable", "msg": "recognizer unavailable"])
                    exit(2)
                }
                DispatchQueue.main.async { self.startEngine() }
            case .denied, .restricted:
                emit(["type": "status", "value": "denied", "msg": "speech permission denied"])
                exit(3)
            case .notDetermined:
                emit(["type": "status", "value": "denied", "msg": "speech permission not determined"])
                exit(3)
            @unknown default:
                emit(["type": "status", "value": "error", "msg": "unknown auth state"])
                exit(4)
            }
        }
    }

    func startEngine() {
        do {
            try beginRecognition()
            emit(["type": "status", "value": "listening"])
            // Watchdog: force a clean restart before SFSpeechRecognizer's ~1-min
            // limit kills the task (the chronic "transcript stops" bug).
            watchdog?.invalidate()
            watchdog = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
                guard let self = self else { return }
                if self.restarting { return }
                if Date().timeIntervalSince(self.cycleStartedAt) >= self.maxCycleSec {
                    // emit any pending partial so no words are lost, then recycle
                    let t = self.lastPartial.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !t.isEmpty { emit(["type": "final", "text": t]); self.lastPartial = "" }
                    self.cycle()
                }
            }
        } catch {
            emit(["type": "status", "value": "error", "msg": "engine start: \(error.localizedDescription)"])
            exit(5)
        }
    }

    func beginRecognition() throws {
        cycleStartedAt = Date()   // watchdog measures cycle age from here
        // Fresh request/task each cycle (recognizer tasks are time-limited).
        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        // Prefer on-device when available (offline, private, fast).
        if #available(macOS 13.0, *), recognizer?.supportsOnDeviceRecognition == true {
            req.requiresOnDeviceRecognition = true
        }
        request = req

        let input = audioEngine.inputNode
        // CONN-120: AEC (setVoiceProcessingEnabled) REMOVED. The Voice-Processing
        // I/O unit needs a configured audio OUTPUT reference; in this sidecar (no
        // output, esp. in a SOLO session) enabling it left the mic input SILENT —
        // the recognizer reported "listening" but never produced a single result
        // ("native active but nothing transcribed"). The remote-echo case it was
        // meant to fix is already handled on the auditor side by transcribing the
        // preclear's WebRTC stream separately, so we use the raw mic here.
        let format = input.outputFormat(forBus: 0)
        if format.channelCount == 0 || format.sampleRate == 0 {
            emit(["type": "status", "value": "error", "msg": "mic input has 0 channels/rate (microphone permission?)"])
            exit(6)
        }
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.request?.append(buffer)
        }
        audioEngine.prepare()
        try audioEngine.start()

        task = recognizer?.recognitionTask(with: req) { [weak self] result, error in
            guard let self = self else { return }
            if let result = result {
                let text = result.bestTranscription.formattedString
                if result.isFinal {
                    self.finalizeWork?.cancel()
                    if !text.isEmpty { emit(["type": "final", "text": text]) }
                    self.lastPartial = ""
                    self.cycle()
                } else {
                    emit(["type": "partial", "text": text])
                    self.lastPartial = text
                    self.scheduleFinalize()   // (re)arm the silence timer
                }
            }
            if error != nil {
                self.cycle()
            }
        }
    }

    // Arm a timer that finalizes the current utterance after a short silence
    // (no new partial). Each partial resets it; firing emits the utterance.
    func scheduleFinalize() {
        finalizeWork?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self = self else { return }
            let text = self.lastPartial.trimmingCharacters(in: .whitespacesAndNewlines)
            if !text.isEmpty { emit(["type": "final", "text": text]) }
            self.lastPartial = ""
            self.cycle()   // reset the recognizer so the next utterance starts clean
        }
        finalizeWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(silenceMs), execute: work)
    }

    // Restart a recognition cycle (keeps the audio engine running between cycles
    // when possible) so dictation continues indefinitely.
    func cycle() {
        if restarting { return }
        restarting = true
        finalizeWork?.cancel()
        request?.endAudio()
        task?.cancel()
        task = nil
        request = nil
        audioEngine.inputNode.removeTap(onBus: 0)
        if audioEngine.isRunning { audioEngine.stop() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
            guard let self = self else { return }
            self.restarting = false
            do { try self.beginRecognition() }
            catch { emit(["type": "status", "value": "error", "msg": "restart: \(error.localizedDescription)"]) }
        }
    }

    func stop() {
        watchdog?.invalidate(); watchdog = nil
        finalizeWork?.cancel()
        task?.cancel(); task = nil
        request?.endAudio(); request = nil
        audioEngine.inputNode.removeTap(onBus: 0)
        if audioEngine.isRunning { audioEngine.stop() }
        emit(["type": "status", "value": "stopped"])
        exit(0)
    }
}

let stt = STT()

// Watch stdin for a "stop" command (and exit on EOF).
DispatchQueue.global().async {
    while let line = readLine(strippingNewline: true) {
        if line == "stop" { DispatchQueue.main.async { stt.stop() } ; break }
    }
    DispatchQueue.main.async { stt.stop() } // stdin closed → parent gone
}

signal(SIGTERM) { _ in exit(0) }
signal(SIGINT)  { _ in exit(0) }

emit(["type": "status", "value": "ready", "msg": localeId])
stt.authorizeAndStart()
RunLoop.main.run()
