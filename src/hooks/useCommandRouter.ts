/**
 * useCommandRouter — Deterministic Voice Command Engine for J.A.R.V.I.S.
 *
 * Intercepts recognized transcript text, classifies intents (English, Urdu, Roman Urdu),
 * validates input arguments, executes registered tools, and logs full lifecycle telemetry.
 */
import { classifyIntent, ClassifiedCommand } from "../services/intentClassifier";
import { executeTool, ToolExecutionResult } from "../services/toolRegistry";

export interface CommandResult {
  handled: boolean;
  requestId?: string;
  confirmation?: string;
  toolResult?: ToolExecutionResult;
  command?: ClassifiedCommand;
}

export async function routeCommandAsync(
  rawText: string,
  onFeedback?: (msg: string) => void
): Promise<CommandResult> {
  const startTime = performance.now();
  const classified = classifyIntent(rawText);

  // 1. Check duplicate execution
  if (classified.isDuplicate) {
    console.warn(
      `[JARVIS INTELLIGENCE] [${classified.requestId}] Duplicate command ignored within window: "${classified.rawText}"`
    );
    return { handled: true, requestId: classified.requestId, command: classified };
  }

  // 2. Check if clarification is required (e.g. "Song chalao" without song name)
  if (classified.requiresClarification && classified.clarificationPrompt) {
    const latency = (performance.now() - startTime).toFixed(1);
    console.log(`[JARVIS INTELLIGENCE] [${classified.requestId}]`, {
      transcript: classified.rawText,
      intent: classified.intent,
      status: "CLARIFICATION_NEEDED",
      prompt: classified.clarificationPrompt,
      latencyMs: latency,
    });

    if (onFeedback) {
      onFeedback(classified.clarificationPrompt);
    }

    return {
      handled: true,
      requestId: classified.requestId,
      confirmation: classified.clarificationPrompt,
      command: classified,
    };
  }

  // 3. Check if an executable tool is identified
  if (classified.toolName && classified.args) {
    console.log(`[JARVIS INTELLIGENCE] [${classified.requestId}] EXECUTING TOOL:`, {
      tool: classified.toolName,
      args: classified.args,
      transcript: classified.rawText,
    });

    const executionResult = await executeTool(classified.toolName, classified.args, {
      requestId: classified.requestId,
      source: "client",
      openInNewTab: true,
    });

    const latency = (performance.now() - startTime).toFixed(1);
    console.log(`[JARVIS INTELLIGENCE] [${classified.requestId}] RESULT:`, {
      tool: classified.toolName,
      success: executionResult.success,
      data: executionResult.data,
      error: executionResult.error,
      latencyMs: latency,
    });

    if (executionResult.confirmationText && onFeedback) {
      onFeedback(executionResult.confirmationText);
    }

    return {
      handled: true,
      requestId: classified.requestId,
      confirmation: executionResult.confirmationText,
      toolResult: executionResult,
      command: classified,
    };
  }

  // 4. Pure conversational turn — let Gemini Live handle verbally
  return { handled: false, requestId: classified.requestId, command: classified };
}

// Synchronous wrapper for backwards compatibility
export function routeCommand(rawText: string): CommandResult {
  const classified = classifyIntent(rawText);
  if (classified.toolName && classified.args) {
    // Fire and forget async execution
    executeTool(classified.toolName, classified.args, {
      requestId: classified.requestId,
      source: "client",
      openInNewTab: true,
    });
    return { handled: true, requestId: classified.requestId, command: classified };
  }
  return { handled: false, requestId: classified.requestId, command: classified };
}
