/**
 * The Responses client every Responses service of the provider goes through, and the ChatGPT plan's client
 * (`chatgpt/client.ts`) builds on: in a file of its own so that one can extend it without importing index.ts,
 * which re-exports the ChatGPT module.
 */
import { ResponsesProvider, type ResponsesProviderOptions } from 'cortico/providers/openai-responses-compat/native.ts';
import type { GenerateOptions } from 'cortico/core/generation.ts';
import type { Request } from 'cortico/protocol/open-responses/index.ts';
import { sinceLastDelivery } from './context.ts';
import type { EffortMap } from './vendors.ts';

/**
 * The Responses client with the thinking level rewritten to the value the service takes for the model
 * (`effortOf`) and images limited to the newest batch (`sinceLastDelivery`).
 */
export class VendorResponses extends ResponsesProvider {
  constructor(opts: ResponsesProviderOptions, private readonly effort: (model: string) => EffortMap | undefined) {
    super(opts);
  }

  protected override buildResponseBody(request: Request, options: GenerateOptions): Record<string, unknown> {
    const body = super.buildResponseBody(request, options.context ? { ...options, context: sinceLastDelivery(options.context) } : options);
    const reasoning = body.reasoning as { effort?: string } | undefined;
    const level = reasoning?.effort;
    const effort = this.effort(request.model ?? '');
    if (!effort || !level || !(level in effort)) return body;
    const to = effort[level as keyof EffortMap];
    if (to === null || to === undefined) delete body.reasoning;
    else body.reasoning = { ...reasoning, effort: to };
    return body;
  }
}
