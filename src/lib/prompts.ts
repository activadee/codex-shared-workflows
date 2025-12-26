import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Prompts are bundled in the src/prompts directory
const promptsDir = join(__dirname, '..', 'prompts');

const promptCache: Record<string, string> = {};

export function loadPrompt(
  name: 'review' | 'label' | 'doc-sync',
  variables: Record<string, string | number | undefined> = {}
): string {
  // Load from cache or file
  if (!promptCache[name]) {
    const filePath = join(promptsDir, `${name}.md`);
    promptCache[name] = readFileSync(filePath, 'utf-8');
  }

  let prompt = promptCache[name];

  // Replace variables: ${VAR_NAME} or $VAR_NAME
  for (const [key, value] of Object.entries(variables)) {
    if (value !== undefined) {
      const regex = new RegExp(`\\$\\{?${key}\\}?`, 'g');
      prompt = prompt.replace(regex, String(value));
    }
  }

  return prompt;
}
