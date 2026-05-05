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
  const allModels = data.models ?? [];

  const generateModels = allModels.filter(m =>
    m.supportedGenerationMethods?.includes('generateContent')
  );
  const embedModels = allModels.filter(m =>
    m.supportedGenerationMethods?.includes('embedContent')
  );

  console.log('\nModels that support generateContent:\n');
  for (const m of generateModels) {
    console.log(`  ${m.name.replace('models/', '')}  (${m.displayName})`);
  }

  console.log('\nModels that support embedContent:\n');
  for (const m of embedModels) {
    console.log(`  ${m.name.replace('models/', '')}  (${m.displayName})`);
  }
  console.log('\nCopy embedding model ID into GEMINI_EMBEDDING_MODEL in your .env');
}

main().catch(err => {
  console.error('Error:', err.message ?? err);
  process.exit(1);
});
