# Previsione registrata PRIMA della seduta — ❌ SMENTITA

> **ESITO, 02/08/2026.** La previsione è **falsa**. Zero gruppi su quattro finiscono a NULL;
> la soglia di smentita che avevo fissato era *due su quattro*.
>
> ```
> #1  NULL → Long Fall → NULL → F/N → NULL → NULL → Long Fall
> #2  Long Fall ×6                                     COSTANTE
> #3  Long Fall → Tick → Long Fall → NULL → SF → Fall
> #4  Tick → NULL → Long Fall → Long Fall → Tick → F/N
> ```
>
> **Perché il risultato precedente sembrava forte: ARRESTO OPZIONALE.** Nelle due sedute che
> avevano dato 6/6 (permutazione 0,02 %) gli item erano stati dati **a blocchi**, e l'auditor
> passava al successivo *quando l'item smetteva di leggere*. La lunghezza del gruppo era quindi
> un ESITO, non un piano — e il mio test teneva fisse lunghezze decise dal risultato. In questa
> seduta gli item erano **alternati**, la regola di arresto sparisce, e con lei il risultato.
>
> L'indizio era nei dati di allora: lunghezze 5·7·5 e 3·6·2, cioè variabili. Bastava guardarle.
>
> **Il risultato del 01/08 è ritratto.** `ripetizioni()` ora marca queste sequenze
> (`bloccoChiusoSuNull`) e il rapporto le esclude dal conteggio.
>
> Resta aperta la domanda vera, che questa prova non ha toccato: *dato lo stesso item con un
> numero di ripetizioni deciso prima, le letture si somigliano?* Su 5 sequenze utilizzabili:
> 1 costante, 4 scorrelate.

---


Scritta il **01/08/2026**, con EQUILIBRIUM v2.0.68, **prima** che la seduta esista.

## Perché esiste questo file

Il criterio « la sequenza finisce a NULL » l'ho scelto **dopo** aver guardato le prime sei
sequenze. Un criterio scelto sui dati che deve spiegare non prova niente: spiega sempre. Il
criterio che avevo fissato *prima* — costante, oppure sempre calante — dà **0 su 6**.

Quindi il risultato di 0,02 % ottenuto finora è una **replica**, non una predizione. Questo file
la trasforma in una predizione, fissandola dove non la posso più ritoccare.

## Il protocollo

- **4 item**, di cui almeno uno che il preclear sa carico.
- Ciascuno dato **3 volte**, alternati (Io, Tu, Io, Tu, …).
- **8–10 secondi** fra un item e il successivo.
- MUSE + METER insieme.

## La previsione

**Tutti e 4 i gruppi finiscono a NULL.**

Cioè: l'ultima lettura di ogni item ripetuto è « nessuna reazione ».

## Cosa la smentisce

**Due o più gruppi su quattro che finiscono con una lettura** (non NULL).

Con la frequenza di NULL osservata finora (9 su 28 = 32 %), quattro gruppi su quattro che
finiscono a NULL per puro caso capitano nell'**1,0 %** dei casi (0,32⁴). La prova ha quindi
abbastanza forza per fallire davvero.

## Cosa NON conta come conferma

- Un gruppo che finisce a NULL perché l'item non ha mai letto (tutta la sequenza NULL): quello
  non è un esaurimento, è un item muto. Va contato a parte.
- Le sequenze già raccolte il 01/08. Questa previsione riguarda **solo** la seduta successiva.

## La seconda domanda, che non è una previsione

Con item a 8–10 s, la prova delle « solitarie » diventa per la prima volta capace di rispondere:
le reazioni del MUSE si accalcano attorno agli item più di quanto farebbe il caso, oppure no?
Non ho una previsione: finora la distanza mediana dall'item (4,8 s) era indistinguibile dal caso
proprio perché gli item si susseguivano ogni 4,8 s.

## Stato al momento della scrittura

| | valore |
|---|---|
| ripetibilità, 6 gruppi | 6/6 finiscono a NULL — caso 0,02 % |
| corrispondenza dei gradi | 9/62 identiche · il caso ne darebbe 12,1 → **sotto il caso** |
| ampiezze (v2, corsa contro corsa) | n=21 · correlazione −0,03 |
| anticipo del MUSE | mediana −100 ms · scarto 858 ms → **sparso** |
| solitarie entro 2 s dall'item | 18 % · caso 19 % → indistinguibile |
