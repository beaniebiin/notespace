import { FileSystemNode, TagColor } from "./types";

export const APP_VERSION = '0.1.0';

export const INITIAL_CONTENT = `# Welcome to NoteSpace!

This is a **markdown-based** knowledge management system inspired by Notion.

## Features
- **Markdown Support**: Write in standard markdown.
- **AI Integration**: Use Gemini to summarize or expand your notes.
- **Hierarchical**: Organize notes in nested folders.
- **Local Storage**: Data persists in your browser.

## Style Demo
> This is a quote block. Inspired by the clean and modern look of Notion's styling.

Here is a list:
1. Item one
2. Item two
   - Sub item A
   - Sub item B

### Code Example
\`\`\`typescript
const greeting = "Hello World";
console.log(greeting);
\`\`\`

---
Enjoy writing!
`;

export const INITIAL_FILE_SYSTEM: FileSystemNode[] = [
  {
    id: 'root-1',
    name: 'Getting Started',
    type: 'note',

    lastModified: Date.now(),
    tags: [
      { id: 'tag-1', label: 'Welcome', color: 'blue' },
      { id: 'tag-2', label: 'Important', color: 'red' }
    ]
  },
  {
    id: 'folder-1',
    name: 'Personal',
    type: 'folder',
    lastModified: Date.now(),
    children: [
      {
        id: 'note-2',
        name: 'Journal',
        type: 'note',

        lastModified: Date.now()
      }
    ]
  }
];

export const TAG_COLORS: Record<TagColor, string> = {
  default: 'bg-gray-100 text-gray-700',
  gray: 'bg-[#EBECED] text-[#5A5E65]',
  brown: 'bg-[#E9E5E3] text-[#603B2C]',
  orange: 'bg-[#FAEBDD] text-[#854C1D]',
  yellow: 'bg-[#FBF3DB] text-[#89632A]',
  green: 'bg-[#DDEDEA] text-[#2B593F]',
  blue: 'bg-[#DDEBF1] text-[#28456C]',
  purple: 'bg-[#EAE4F2] text-[#492F64]',
  pink: 'bg-[#F4DFEB] text-[#69314C]',
  red: 'bg-[#FBE4E4] text-[#6E3630]',
};