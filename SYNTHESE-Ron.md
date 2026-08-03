# EQUILIBRIUM — où nous en sommes

*Note pour Ron · version 2.0.80*

---

## Ce que c'est devenu

Ce n'est plus une maquette. C'est un instrument d'audition qui tourne, avec deux
sources de mesure branchées en même temps :

- le **MUSE 2** — EEG à 4 électrodes, pouls, accéléromètre, gyroscope ;
- le **THETA-METER** — un vrai e-mètre en USB, les boîtes tenues dans les mains,
  une résistance cutanée mesurée en ohms.

Le travail a été long, et il s'est fait **à mesure de tes indications** : chaque
fois que tu as dit « il faut ça », un module est né. Ils sont aujourd'hui une
douzaine, et ils fonctionnent.

## Ils sont indépendants — c'est voulu

Aucun module n'en commande un autre. Le journal, la santé système, l'intégrité
biométrique, le MNA, les caméras, le R&I : chacun s'allume et s'éteint tout seul,
depuis CONFIG, sans rien casser ailleurs.

**Tu peux donc en garder ce que tu veux et retirer le reste.** Ce n'est pas une
promesse en l'air : c'est déjà comme ça que l'app se comporte quand un instrument
manque — les modules qui ne sont pas exploitables par l'instrument choisi se
cachent d'eux-mêmes.

## L'interface est une proposition, pas une décision

Ce que tu vois à l'écran est **une proposition**. Elle changera selon ce que tu
veux voir.

Nous savons qu'elle peut être simplifiée — et qu'un jour elle devra l'être, parce
qu'un auditeur en séance ne doit pas lire un tableau de bord. Mais au point où
nous en sommes, **nous avons besoin de voir toute l'ingénierie** : les chiffres
bruts, les états intermédiaires, les diagnostics. C'est ce qui nous permet de
tester, de corriger et de continuer. Ce qu'on cache trop tôt, on ne peut plus le
mesurer.

Quand la mesure sera stabilisée, l'écran se videra de lui-même.

---

## Ce que l'instrument fait aujourd'hui

**Une seule aiguille, et l'auditeur choisit laquelle.** Avec les deux instruments
branchés, un sélecteur sous le pivot : MUSE ou METER. Deux aiguilles sur le même
cadran trompent l'œil.

**Les cycles.** CONTACT → DISSOLUTION → AS-IS, et son miroir NULL → RISE → CLEAR
READ. Ils suivent la dissolution de la charge en direct, par sa signature
énergétique. L'AS-IS est **proposé** ; c'est l'auditeur qui le valide, jamais
l'app.

**L'assessment.** Les items donnés à la voix s'inscrivent seuls avec leur lecture,
datée à la fin exacte du mot — une réaction qui arrive plus tard est latente et ne
compte pas.

**Le R&I.** Sous chaque item : « indique au PC ? ». C'est le seul critère
extérieur aux deux aiguilles.

**Le Tone Arm.** Avec le THETA-METER c'est une résistance réellement mesurée,
taraudée avec l'artefact physique. Sans lui, le TA est reconstruit depuis l'EEG :
on lit alors le mouvement, pas le nombre.

**L'archive.** Chaque séance s'écrit dans un fichier destiné à une analyse
ultérieure — sans aucun nom, aucune parole, aucun contenu d'item. Uniquement des
temps, des amplitudes et des classifications. C'est de là que viennent les
chiffres ci-dessous.

---

## Ce que la mesure dit — et ce qu'elle ne dit pas

Nous avons 42 séances, dont 32 avec les deux instruments. Voici l'état honnête.

**Les deux aiguilles ne mesurent pas la même chose.** Sur 206 réactions appariées,
elles donnent la même lecture 31 fois — alors que le hasard seul en donnerait 36.
Elles s'accordent **moins** que deux tirages indépendants. Et sur la seule décision
qui compte en assessment — *cet item lit-il ?* — elles sont statistiquement
indépendantes.

Ce n'est pas un défaut de l'un ou de l'autre. C'est que l'EEG mesure une activité
centrale et les boîtes une réponse cutanée. Nous ne savons pas encore laquelle
suit la charge du préclair.

**Le MUSE réagit beaucoup plus** — 1782 réactions contre 232. Mais ses réactions
supplémentaires ne se groupent pas autour des items plus que ne le ferait le
hasard. Elles ne sont donc pas, en l'état, la preuve d'une perception plus fine.

**Trois conclusions ont été retirées** après vérification : un décalage temporel
qui n'existait pas, une répétabilité qui venait de la façon de donner les items,
une correspondance calculée sans référence au hasard. Nous préférons vous les
signaler plutôt que de les taire.

**La F/N de l'aiguille réelle a été taraudée sur vidéo** — les quatre types filmés
sur un vrai cadran. Le détecteur ne voyait aucun des quatre ; il les voit tous
maintenant, et les contrôles négatifs restent muets.

⚠️ **Mais attention** : depuis ce taraudage, l'aiguille réelle produit **350 F/N**
que le MUSE ne confirme pas, sur 32 séances. C'est beaucoup. Le taraudage a été
vérifié sur une vidéo — donc sur une aiguille dessinée, plus propre qu'une vraie.
Il est possible qu'il soit devenu trop permissif sur le terrain. **C'est le
prochain point à regarder**, et nous ne voulons pas le présenter autrement.

---

## Ce qui manque encore

- **Savoir laquelle des deux aiguilles suit la charge.** Aucune des deux ne peut
  juger l'autre. Seul le préclair peut trancher, et c'est à ça que sert le R&I.
  Il nous faut simplement plus de séances.
- **Le com lag** reste le seul avantage propre du MUSE : l'activité centrale
  précède la réponse cutanée. Les boîtes ne peuvent pas le donner.
- **La calibration de la F/N réelle**, à reprendre sur des séances vraies.

---

## En un mot

Le programme fonctionne, il est modulaire, et rien n'y est figé. L'interface est
chargée parce que nous mesurons encore ; elle s'allégera quand nous saurons quoi
garder.

Dis-nous ce que tu veux voir, ce que tu veux enlever, et ce que tu veux qu'on
mesure ensuite.
