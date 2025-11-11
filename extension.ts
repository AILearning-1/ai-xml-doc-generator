import * as vscode from 'vscode';
import OpenAI from 'openai';

interface FunctionInfo {
  name: string;
  params: string[];
  returnType: string;
  body: string;
}

export function activate(context: vscode.ExtensionContext) {
  console.log('AI Documentation Generator is now active');

  let disposable = vscode.commands.registerCommand(
    'ai-doc-generator.generateSummary',
    async () => {
      const editor = vscode.window.activeTextEditor;
      
      if (!editor) {
        vscode.window.showErrorMessage('No active editor found');
        return;
      }

      // Get API key from settings
      const config = vscode.workspace.getConfiguration('aiDocGenerator');
      const apiKey = config.get<string>('openaiApiKey');
      
      if (!apiKey) {
        const input = await vscode.window.showInputBox({
          prompt: 'Enter your OpenAI API Key',
          password: true,
          ignoreFocusOut: true
        });
        
        if (!input) {
          vscode.window.showErrorMessage('API Key is required');
          return;
        }
        
        await config.update('openaiApiKey', input, vscode.ConfigurationTarget.Global);
      }

      try {
        await generateDocumentation(editor);
      } catch (error) {
        vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  );

  context.subscriptions.push(disposable);
}

async function generateDocumentation(editor: vscode.TextEditor) {
  const selection = editor.selection;
  const document = editor.document;
  
  // Get the current line or expand to function
  let functionInfo: FunctionInfo;
  let insertLine: number;
  
  if (selection.isEmpty) {
    // No selection - detect function at cursor
    const result = detectFunctionAtCursor(document, selection.active.line);
    if (!result) {
      vscode.window.showErrorMessage('Place cursor on a function or select code to document');
      return;
    }
    functionInfo = result.functionInfo;
    insertLine = result.startLine;
  } else {
    // Use selection
    const selectedText = document.getText(selection);
    functionInfo = parseFunctionFromText(selectedText);
    insertLine = selection.start.line;
  }

  // Show progress
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Generating documentation...',
    cancellable: false
  }, async () => {
    const summary = await generateSummaryWithChatGPT(functionInfo);
    await insertDocumentation(editor, insertLine, summary, functionInfo);
  });

  vscode.window.showInformationMessage('Documentation generated successfully!');
}

function detectFunctionAtCursor(document: vscode.TextDocument, cursorLine: number): 
  { functionInfo: FunctionInfo; startLine: number } | null {
  
  // Look for function declaration patterns
  const functionPatterns = [
    /^\s*(export\s+)?(const|function|let|var)\s+(\w+)\s*=?\s*(?:async\s*)?\([^)]*\)\s*(?::\s*\w+\s*)?(?:=>|{)/,
    /^\s*(export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)/
  ];

  let startLine = cursorLine;
  let foundFunction = false;

  // Search backwards from cursor to find function start
  for (let i = cursorLine; i >= Math.max(0, cursorLine - 20); i--) {
    const lineText = document.lineAt(i).text;
    
    for (const pattern of functionPatterns) {
      if (pattern.test(lineText)) {
        startLine = i;
        foundFunction = true;
        break;
      }
    }
    
    if (foundFunction) break;
  }

  if (!foundFunction) {
    return null;
  }

  // Find the end of the function
  let braceCount = 0;
  let endLine = startLine;
  let functionText = '';

  for (let i = startLine; i < document.lineCount; i++) {
    const lineText = document.lineAt(i).text;
    functionText += lineText + '\n';

    // Count braces to find function end
    for (const char of lineText) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
    }

    if (braceCount === 0 && lineText.includes('{')) {
      endLine = i;
      break;
    }

    // Limit to reasonable function size
    if (i - startLine > 100) break;
  }

  const functionInfo = parseFunctionFromText(functionText);
  return { functionInfo, startLine };
}

function parseFunctionFromText(text: string): FunctionInfo {
  // Extract function name
  const nameMatch = text.match(/(?:function|const|let|var)\s+(\w+)|(\w+)\s*(?:=\s*(?:async\s*)?\(|:\s*\()/);
  const name = nameMatch ? (nameMatch[1] || nameMatch[2]) : 'unknown';

  // Extract parameters
  const paramsMatch = text.match(/\(([^)]*)\)/);
  const paramsStr = paramsMatch ? paramsMatch[1] : '';
  const params = paramsStr
    .split(',')
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .map(p => {
      // Extract param name, ignoring type annotations and default values
      const paramName = p.split(':')[0].split('=')[0].trim();
      return paramName;
    });

  // Extract return type if present
  const returnMatch = text.match(/\):\s*(\w+(?:<[^>]+>)?)/);
  const returnType = returnMatch ? returnMatch[1] : 'void';

  return {
    name,
    params,
    returnType,
    body: text
  };
}

async function generateSummaryWithChatGPT(functionInfo: FunctionInfo): Promise<string> {
  const config = vscode.workspace.getConfiguration('aiDocGenerator');
  const apiKey = config.get<string>('openaiApiKey');
  const model = config.get<string>('model') || 'gpt-4';

  if (!apiKey) {
    throw new Error('OpenAI API Key not configured');
  }

  const openai = new OpenAI({ apiKey });

  const prompt = `Analyze this JavaScript/TypeScript function and generate a concise summary for XML documentation.

Function:
${functionInfo.body}

Provide ONLY a brief summary (1-2 sentences) describing what this function does. Do not include parameter descriptions or return value descriptions. Focus on the function's purpose and behavior.`;

  const response = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: 'You are a technical documentation expert. Provide concise, clear function summaries suitable for XML documentation comments.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: 0.3,
    max_tokens: 150
  });

  const summary = response.choices[0]?.message?.content?.trim() || 'Generated summary';
  return summary;
}

async function insertDocumentation(
  editor: vscode.TextEditor,
  line: number,
  summary: string,
  functionInfo: FunctionInfo
) {
  const document = editor.document;
  const lineText = document.lineAt(line).text;
  const indent = lineText.match(/^\s*/)?.[0] || '';

  // Build XML documentation
  let doc = `${indent}/**\n`;
  doc += `${indent} * <summary>\n`;
  doc += `${indent} * ${summary}\n`;
  doc += `${indent} * </summary>\n`;

  // Add param tags
  for (const param of functionInfo.params) {
    if (param && param !== '...') {
      doc += `${indent} * <param name="${param}"></param>\n`;
    }
  }

  // Add return tag if not void
  if (functionInfo.returnType !== 'void') {
    doc += `${indent} * <returns></returns>\n`;
  }

  doc += `${indent} */\n`;

  // Insert at the beginning of the line
  const position = new vscode.Position(line, 0);
  const edit = new vscode.WorkspaceEdit();
  edit.insert(document.uri, position, doc);
  
  await vscode.workspace.applyEdit(edit);
}

export function deactivate() {}