/**
 * afterPack.cjs — electron-builder afterPack hook
 *
 * electron-builder's extendInfo only patches the MAIN app's Info.plist.
 * On macOS 13+, the Renderer and other helper processes also need
 * NSBluetoothAlwaysUsageDescription or macOS kills them with a TCC crash.
 * This script patches all helper Info.plists after packing.
 */
const plist  = require('plist');
const fs     = require('fs');
const path   = require('path');
const { execSync } = require('child_process');

const BT_KEYS = {
  NSBluetoothAlwaysUsageDescription:
    'Static Meter uses Bluetooth to connect to the Muse 2 headset and Theta Meter Nano.',
  NSBluetoothPeripheralUsageDescription:
    'Static Meter uses Bluetooth to connect to BLE biometric devices.',
};

module.exports = async function afterPack(context) {
  const { appOutDir, packager } = context;
  if (packager.platform.name !== 'mac') return;

  // Find the .app inside appOutDir
  const appName  = packager.appInfo.productFilename;
  const appPath  = path.join(appOutDir, `${appName}.app`);
  const fwDir    = path.join(appPath, 'Contents', 'Frameworks');

  if (!fs.existsSync(fwDir)) return;

  // Find all Helper .app bundles inside Frameworks/
  const entries = fs.readdirSync(fwDir);
  const helpers = entries.filter(e => e.endsWith('.app') && e.includes('Helper'));

  for (const helperName of helpers) {
    const plistPath = path.join(fwDir, helperName, 'Contents', 'Info.plist');
    if (!fs.existsSync(plistPath)) continue;

    try {
      // Read the existing plist (binary or XML)
      const raw = fs.readFileSync(plistPath);
      let data;
      try {
        // Try JSON plist module first
        data = plist.parse(raw.toString('utf8'));
      } catch {
        // Fallback: use plutil to convert binary plist → XML → parse
        execSync(`plutil -convert xml1 "${plistPath}"`, { stdio: 'inherit' });
        data = plist.parse(fs.readFileSync(plistPath, 'utf8'));
      }

      let changed = false;
      for (const [k, v] of Object.entries(BT_KEYS)) {
        if (!data[k]) { data[k] = v; changed = true; }
      }

      if (changed) {
        fs.writeFileSync(plistPath, plist.build(data), 'utf8');
        console.log(`  [afterPack] Bluetooth keys added to ${helperName}`);
      }
    } catch (e) {
      console.warn(`  [afterPack] Could not patch ${helperName}: ${e.message}`);
    }
  }
};
