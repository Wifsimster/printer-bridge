import i18n from "@/i18n";

export type FortuneCategory =
  | "motivational"
  | "jokes"
  | "compliments"
  | "proverbs";

export const FORTUNE_CATEGORIES: FortuneCategory[] = [
  "motivational",
  "jokes",
  "compliments",
  "proverbs",
];

type FortuneTable = Record<FortuneCategory, string[]>;

const FORTUNES: Record<string, FortuneTable> = {
  en: {
    motivational: [
      "The best time to start was yesterday. The next best time is now.",
      "Small steps every day add up to big distances.",
      "Done is better than perfect.",
      "You're allowed to be a work in progress and a masterpiece at the same time.",
      "Doubt kills more dreams than failure ever will.",
      "Discipline is choosing what you want most over what you want now.",
      "The cave you fear to enter holds the treasure you seek.",
      "Energy flows where attention goes.",
    ],
    jokes: [
      "I told my wife she was drawing her eyebrows too high. She looked surprised.",
      "Why don't scientists trust atoms? Because they make up everything.",
      "Parallel lines have so much in common. Shame they'll never meet.",
      "I'm reading a book about anti-gravity. Impossible to put down.",
      "Why did the scarecrow win an award? He was outstanding in his field.",
      "I would tell you a chemistry joke, but I know I wouldn't get a reaction.",
      "What do you call fake spaghetti? An impasta.",
      "I'm on a seafood diet. I see food and I eat it.",
    ],
    compliments: [
      "You handle hard things with grace.",
      "The world is a little brighter with you in it.",
      "Your effort today is someone else's inspiration tomorrow.",
      "You ask the kind of questions that make people think.",
      "Your laugh is contagious — keep using it.",
      "You're the friend everyone wishes they had.",
      "Your taste in random things is excellent.",
      "You make ordinary moments feel special.",
    ],
    proverbs: [
      "A journey of a thousand miles begins with a single step.",
      "Rome wasn't built in a day.",
      "Where there's a will, there's a way.",
      "After rain comes sunshine.",
      "The early bird catches the worm, but the second mouse gets the cheese.",
      "Don't count your chickens before they hatch.",
      "Still waters run deep.",
      "Actions speak louder than words.",
    ],
  },
  fr: {
    motivational: [
      "Le meilleur moment pour commencer, c'était hier. Le deuxième meilleur, c'est maintenant.",
      "Petit à petit, l'oiseau fait son nid.",
      "Fait vaut mieux que parfait.",
      "Tu as le droit d'être un brouillon et un chef-d'œuvre en même temps.",
      "Le doute tue plus de rêves que l'échec ne le fera jamais.",
      "La discipline, c'est choisir ce que tu veux le plus plutôt que ce que tu veux maintenant.",
      "La grotte que tu redoutes d'explorer cache le trésor que tu cherches.",
      "L'énergie va où va l'attention.",
    ],
    jokes: [
      "Pourquoi les plongeurs plongent-ils toujours en arrière ? Parce que sinon ils tombent dans le bateau.",
      "Que dit un escargot quand il croise une limace ? Regarde le nudiste !",
      "Quel est le comble pour un électricien ? Ne pas être au courant.",
      "Quelle est la femelle du hamster ? Amsterdam.",
      "Pourquoi les poissons n'aiment pas l'ordinateur ? Ils ont peur du net.",
      "Que fait une fraise sur un cheval ? Tagada tagada…",
      "Pourquoi les girafes ont-elles un long cou ? Parce qu'elles ont les pieds qui puent.",
      "Quel est le sport le plus silencieux ? Le parachutisme — on n'entend que dalle.",
    ],
    compliments: [
      "Tu gères les choses difficiles avec grâce.",
      "Le monde est un peu plus beau avec toi dedans.",
      "Tes efforts d'aujourd'hui sont l'inspiration de quelqu'un demain.",
      "Tu poses les questions qui font réfléchir les gens.",
      "Ton rire est contagieux — continue de l'utiliser.",
      "Tu es l'ami·e que tout le monde aimerait avoir.",
      "Tu as un goût excellent pour les trucs improbables.",
      "Tu rends les moments ordinaires un peu spéciaux.",
    ],
    proverbs: [
      "Petit à petit, l'oiseau fait son nid.",
      "Paris ne s'est pas faite en un jour.",
      "Qui veut peut.",
      "Après la pluie, le beau temps.",
      "L'avenir appartient à ceux qui se lèvent tôt.",
      "Il ne faut pas vendre la peau de l'ours avant de l'avoir tué.",
      "Il n'y a pas de fumée sans feu.",
      "Les actes valent mieux que les mots.",
    ],
  },
  es: {
    motivational: [
      "El mejor momento para empezar fue ayer. El segundo mejor es ahora.",
      "Poco a poco se va lejos.",
      "Hecho es mejor que perfecto.",
      "Tienes derecho a ser un borrador y una obra maestra al mismo tiempo.",
      "La duda mata más sueños que el fracaso.",
      "Disciplina es elegir lo que más quieres en lugar de lo que quieres ahora.",
      "La cueva que temes entrar guarda el tesoro que buscas.",
      "La energía fluye donde va la atención.",
    ],
    jokes: [
      "¿Qué hace una abeja en el gimnasio? Zum-ba.",
      "¿Cuál es el café más peligroso? Un exprés-ivo.",
      "¿Qué le dice un jaguar a otro? ¿Jaguar yu?",
      "¿Cómo se despiden los químicos? Ácido un placer.",
      "¿Por qué los pájaros vuelan al sur? Porque ir andando es muy lejos.",
      "Tengo un chiste sobre la lejía. Pero está muy desgastado.",
      "¿Qué hace un pez? Nada.",
      "¿Qué le dice un techo a otro techo? Te echo de menos.",
    ],
    compliments: [
      "Manejas las cosas difíciles con gracia.",
      "El mundo es un poco más luminoso contigo.",
      "Tu esfuerzo de hoy es la inspiración de alguien mañana.",
      "Haces el tipo de preguntas que hacen pensar.",
      "Tu risa es contagiosa — sigue usándola.",
      "Eres el amigo que todos querrían tener.",
      "Tienes un gusto excelente para cosas raras.",
      "Haces que los momentos comunes se sientan especiales.",
    ],
    proverbs: [
      "Un viaje de mil millas empieza con un solo paso.",
      "Roma no se construyó en un día.",
      "Querer es poder.",
      "Después de la tormenta llega la calma.",
      "A quien madruga, Dios le ayuda.",
      "No por mucho madrugar amanece más temprano.",
      "En boca cerrada no entran moscas.",
      "Obras son amores y no buenas razones.",
    ],
  },
  de: {
    motivational: [
      "Der beste Zeitpunkt anzufangen war gestern. Der zweitbeste ist jetzt.",
      "Kleine Schritte jeden Tag ergeben große Entfernungen.",
      "Erledigt ist besser als perfekt.",
      "Du darfst gleichzeitig ein Entwurf und ein Meisterwerk sein.",
      "Zweifel tötet mehr Träume als das Scheitern.",
      "Disziplin ist, das zu wählen, was du am meisten willst, statt was du jetzt willst.",
      "Die Höhle, vor der du dich fürchtest, birgt den Schatz, den du suchst.",
      "Energie fließt dorthin, wo die Aufmerksamkeit hingeht.",
    ],
    jokes: [
      "Treffen sich zwei Jäger. Beide tot.",
      "Was ist orange und geht durch die Wüste? Eine Wanderine.",
      "Wie nennt man einen kleinen Vater? Minimum.",
      "Was sagt ein Hai, der einen Surfer gefressen hat? Schmeckt nach mehr.",
      "Warum können Geister so schlecht lügen? Weil man durch sie hindurchsieht.",
      "Was macht ein Pirat am Computer? Er drückt die Enter-Taste.",
      "Wie nennt man eine Katze, die alles weiß? Wikipedia.",
      "Was ist grün und klopft an der Tür? Klopfsalat.",
    ],
    compliments: [
      "Du meisterst schwere Dinge mit Anmut.",
      "Die Welt ist mit dir ein bisschen heller.",
      "Deine Mühe heute ist die Inspiration anderer morgen.",
      "Du stellst die Fragen, die Menschen zum Nachdenken bringen.",
      "Dein Lachen ist ansteckend — nutze es weiter.",
      "Du bist der Freund, den jeder gerne hätte.",
      "Du hast einen exzellenten Geschmack für seltsame Dinge.",
      "Du machst gewöhnliche Momente besonders.",
    ],
    proverbs: [
      "Eine Reise von tausend Meilen beginnt mit einem einzigen Schritt.",
      "Rom wurde nicht an einem Tag erbaut.",
      "Wo ein Wille ist, ist ein Weg.",
      "Nach Regen kommt Sonnenschein.",
      "Der frühe Vogel fängt den Wurm.",
      "Stille Wasser sind tief.",
      "Aller Anfang ist schwer.",
      "Taten sagen mehr als Worte.",
    ],
  },
};

function tableFor(lang?: string): FortuneTable {
  const code = (lang ?? i18n.language ?? "en").split("-")[0];
  return FORTUNES[code] ?? FORTUNES.en;
}

export function pickFortune(
  category: FortuneCategory,
  lang?: string
): string {
  const list = tableFor(lang)[category];
  return list[Math.floor(Math.random() * list.length)];
}
