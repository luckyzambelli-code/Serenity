# TONE SCALE — ce que nous en avons fait

*Note pour Ron · version 2.0.93*

---

Ton dernier message est arrivé, et nous l'avons construit. Voici ce que ça donne,
et une question qui reste ouverte — la seule, mais elle compte.

---

## Le cadran

Un arc gradué de **−40 à +40**, huit divisions de dix, le zéro au centre. Sous les
chiffres court une bande qui se charge en s'éloignant du zéro, pareille des deux
côtés : on lit l'ampleur de la résistance d'un coup d'œil, sans mettre au point
sur le chiffre.

C'est une **quatrième vue**, à côté de CONTACT, NULL et MIRROR. Même géométrie que
les autres — même pivot, même course d'aiguille — pour qu'on n'ait rien à
réapprendre en passant de l'une à l'autre.

---

## Les quatre temps

**1 · Localiser.** L'aiguille se pose sur un nombre. On presse quand le préclair a
trouvé.

**2 · Positif ou négatif ?** On assesse « négatif ? » puis « positif ? ».

**3 · Combien de divisions ?** On assesse 10, 20, 30, 40.

**4 · Mock-upper l'opposé.** Une ligne ambre marque la valeur en jeu, une ligne
teal en pointillé marque l'opposé à mock-upper. Quand c'est fait, elle devient
pleine.

Chaque temps est écrit à l'écran : le pas, ce qu'il faut faire, et ce que
l'aiguille propose. On ne se souvient pas d'une procédure à quatre temps de tête.

---

## Ce que nous avons changé à ta procédure, et pourquoi

**Tu assesses parce que tu travailles sans mètre.** Avec l'aiguille, le point 1
donne déjà un nombre : elle se pose sur une division. Alors la **mesure propose**
et l'**assessment vérifie**. Le bouton que la mesure suggère porte un point ; c'est
une proposition, pas une réponse déjà donnée.

Sans mètre, il n'y a pas de proposition et l'assessment redevient l'unique source
— ta situation exactement. La vue marche dans les deux cas, et elle dit lequel des
deux on est en train de faire.

**La vérification ne réclame pas le chiffre exact.** L'aiguille tombe entre deux
divisions : à −23, si le préclair trouve −20 ou −30, personne ne s'est trompé. On
tolère une division d'écart. Au-delà, l'app écrit « l'aiguille disait autre chose »
— et ce désaccord-là est reporté dans le rapport final, parce que c'est le seul
endroit où l'instrument et la personne se contredisent en clair.

**L'instant de la localisation n'est pas celui du clic.** En séance, appuyer sur le
bouton fait souvent partir une réaction — sur le mètre comme sur le MUSE. Et de
toute façon le préclair a pensé la chose *avant* que la main de l'auditeur
n'arrive sur le bouton. On remonte donc de 2,5 secondes :

- **le MUSE dit QUAND** — son pic est la pensée, et l'EEG la capte avant que le
  corps ne la manifeste ;
- **le METER dit COMBIEN** — le TA à cet instant-là.

Sans MUSE, on s'ancre au mouvement du mètre et on prend son *départ*, pas son
arrivée : le départ est la pensée, le reste est l'aiguille qui y va. Si rien n'a
réagi, on prend la médiane de la fenêtre. L'app écrit lequel des trois cas
s'applique — « le MUSE a vu la pensée · −0,6 s ».

---

## L'as-isness : le zéro, pas l'opposé

Question qui s'est posée ici : l'aiguille doit-elle aller sur la valeur opposée ?
Nous ne le croyons pas, et la distinction est tout le point. Le préclair
*mock-uppe* le +40 ; le **résultat** est que les deux s'annulent et que la
résistance revient **au centre**. Si l'aiguille se fixait sur le +40, il n'y aurait
eu aucun as-is : on aurait remplacé une charge par une autre de signe opposé.

C'est aussi une prédiction **falsifiable**, et c'est pour ça qu'elle vaut la peine
d'être mesurée. Si en séance l'aiguille finissait sur l'opposé, ton modèle voudrait
dire autre chose, et nous le saurions.

**Trois témoins**, selon ce qui est branché :

| témoin | ce qu'il dit | instrument |
|---|---|---|
| aiguille à zéro | la résistance mesurée est revenue au centre | METER |
| F/N | un Floating Needle sur l'aiguille en jeu | l'un des deux |
| charge dissoute | l'activité EEG de la masse contactée s'est effondrée | MUSE |

L'app **propose** quand **deux** concordent, jamais sur un seul. Un signal se
trompe : la F/N du mètre est aujourd'hui trop permissive chez nous, et une position
à zéro peut se traverser par hasard. Quand un seul témoin existe, on propose quand
même, mais l'app écrit que c'en est un seul. **C'est toujours l'auditeur qui
valide.**

---

## Ce qui vient avec

**L'assessment s'allume tout seul** aux temps 2 et 3 — qui *sont* un assessment —
et se détache en entrant dans le mock-up, en laissant le panneau ouvert pour
consulter. Et quand on clique « indique au PC » sur un item, le cycle avance de
lui-même : dire « négatif » puis re-cliquer le bouton en haut, c'était dire deux
fois la même chose.

**Chaque cycle TONE est enregistré** — l'item, ce que l'aiguille disait, ce que le
préclair a validé, l'accord ou le désaccord, les témoins qui se sont allumés. Dans
le rapport, dans le PDF, dans le journal.

---

## La question ouverte : les ohms sont-ils linéaires ?

Tu as dit : « the total ohms in the system by 80 », et linéaire. **Nous ne pouvons
pas encore le faire exactement**, et il faut que tu le saches.

Notre mètre envoie un nombre brut. Nous savons le traduire en **TA**, parce que
nous avons l'artefact de calibrage : quatre boutons, quatre couples certains.
Mais nous ne savons pas le traduire en **ohms** — et ta graduation est définie en
ohms.

Aujourd'hui l'échelle passe donc par le TA. Le cadran écrit un **≈** devant le
chiffre pour le dire : le nombre est utilisable, ce n'est pas encore ta graduation.

Le TA n'est pas linéaire en ohms, ou du moins nous n'en savons rien. Nos propres
mesures montrent que le **brut** est courbe par rapport au TA — 1,24 M par unité en
bas de l'échelle, 2,76 M en haut. Ça concerne le capteur, pas forcément la
graduation : le TA pourrait très bien être linéaire en ohms malgré ça.

**Ce qu'il faut pour le savoir**, et c'est simple : mesurer les résistances de
l'artefact de calibrage. C'est une boîte de résistances — ses boutons « TA 2, 3, 4,
5 » sont des résistors choisis exprès. Un multimètre sur chaque position donne
quatre triplets `(ohm, TA, brut)`, et tout est réglé, sans rien acheter.

Et nous apprendrions au passage quelque chose qui t'intéresse : **si les quatre
résistances sont régulièrement espacées, le TA est déjà linéaire en ohms** — et
notre échelle actuelle était juste depuis le début. Sinon nous saurons de combien
nous nous trompons aujourd'hui.

Claudio va le mesurer. Dès que nous aurons les quatre nombres, le **≈** disparaît.

---

Dis-nous ce qui ne correspond pas à ce que tu fais. Le cadran est une proposition ;
la procédure, c'est la tienne.
