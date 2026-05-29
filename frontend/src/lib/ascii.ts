export type AsciiScene = {
  id: string;
  lines: string[];
};

export const ASCII_GALLERY: AsciiScene[] = [
  {
    id: "cat",
    lines: [
      "   /\\_/\\  ",
      "  ( o.o ) ",
      "   > ^ <  ",
    ],
  },
  {
    id: "bunny",
    lines: [
      "  (\\(\\   ",
      "  ( -.-) ",
      "  o_(\")(\")",
    ],
  },
  {
    id: "owl",
    lines: [
      "   ,___,  ",
      "   [O,O]  ",
      "   /)__) ",
      "   -\"--\"- ",
    ],
  },
  {
    id: "dog",
    lines: [
      "    __      ",
      "  o-''|\\_____/) ",
      "   \\_/|_)     ) ",
      "      \\  __  /  ",
      "      (_/ (_/   ",
    ],
  },
  {
    id: "robot",
    lines: [
      "   [^_^]  ",
      "  /|_|_|\\ ",
      "   d| |b  ",
    ],
  },
  {
    id: "ghost",
    lines: [
      "    .-.   ",
      "   ( o o )",
      "    | O | ",
      "   '~^~^~'",
    ],
  },
  {
    id: "rocket",
    lines: [
      "     /\\    ",
      "    /  \\   ",
      "   | UM |  ",
      "   | NO |  ",
      "    ----   ",
      "    /||\\   ",
      "   /_||_\\  ",
    ],
  },
  {
    id: "flower",
    lines: [
      "    _   _   ",
      "   (_)_(_)  ",
      "   (_)#(_)  ",
      "    (___)   ",
      "      |     ",
      "     \\|/    ",
      "      |     ",
    ],
  },
  {
    id: "heart",
    lines: [
      "   ** **   ",
      "  *** ***  ",
      "  *******  ",
      "   *****   ",
      "    ***    ",
      "     *     ",
    ],
  },
  {
    id: "star",
    lines: [
      "      *     ",
      "     ***    ",
      "  *********",
      "    *****   ",
      "    ** **   ",
      "   *     *  ",
    ],
  },
];

export function asciiSceneToText(scene: AsciiScene): string {
  const width = scene.lines.reduce((m, l) => Math.max(m, l.length), 0);
  return scene.lines.map((l) => l.padEnd(width, " ")).join("\n");
}
