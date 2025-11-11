# 🧠 AI Documentation Generator for VS Code

Automatically generate **XML-style documentation comments** for your JavaScript and TypeScript functions using **OpenAI GPT models**.  
This extension analyzes your code, summarizes the function’s purpose, and inserts clear, consistent doc comments directly above the function.

---

## ✨ Features

- 🪶 **Automatic summaries** using GPT-4 or other OpenAI models  
- 🧩 Works with **JavaScript** and **TypeScript** function types:
  - Standard functions (`function myFunc()`)
  - Arrow functions (`const myFunc = () => {}`)
  - Exported and async functions
- 🧠 Smart **function detection** (no need to select code)
- ⚙️ Uses **VS Code settings** for API key and model
- 📝 Generates **XML-style documentation**:
  ```ts
  /**
   * <summary>
   * Adds two numbers and returns the sum.
   * </summary>
   * <param name="a"></param>
   * <param name="b"></param>
   * <returns></returns>
   */
  function add(a, b) {
    return a + b;
  }
