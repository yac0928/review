/**
 * Lists all Gemini models available to your API key that support generateContent.
 * Usage: npx ts-node scripts/listModels.ts
 */
import { config } from '../src/config';

interface ModelInfo {
  name: string;
  displayName: string;
  supportedGenerationMethods: string[];
}

interface ListModelsResponse {
  models: ModelInfo[];
}

async function main() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${config.geminiApiKey}`;
  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as ListModelsResponse;
  const generateModels = (data.models ?? []).filter(m =>
    m.supportedGenerationMethods?.includes('generateContent')
  );

  console.log('\nModels that support generateContent:\n');
  for (const m of generateModels) {
    const id = m.name.replace('models/', '');
    console.log(`  ${id}  (${m.displayName})`);
  }
  console.log('\nCopy the model ID you want into GEMINI_MODEL in your .env');
}

main().catch(err => {
  console.error('Error:', err.message ?? err);
  process.exit(1);
});
