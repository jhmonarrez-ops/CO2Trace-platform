// Claude through Amazon Bedrock (Messages API, bedrock-mantle endpoint), signed with the function's IAM role.
import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk';
import type { AssistantConfig, MessagesClient } from './assistant.ts';

export function bedrockClient(region = process.env.BEDROCK_REGION || process.env.AWS_REGION): MessagesClient {
  return new AnthropicBedrockMantle({ awsRegion: region, maxRetries: 2 });
}
// Model IDs carry the `anthropic.` prefix on Bedrock; both can be changed per stage without a code change.
export const assistantConfig = (): AssistantConfig => ({
  helpModel: process.env.HELP_MODEL || 'anthropic.claude-opus-5-5',
  extractModel: process.env.EXTRACT_MODEL || 'anthropic.claude-opus-5-5',
});
