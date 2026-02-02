/**
 * TutorialPanel component
 *
 * Accordion-style panel with setup instructions for Ollama and ComfyUI.
 */

import { useState, useCallback } from 'react';
import './SettingsDialog.css';

interface AccordionSectionProps {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function AccordionSection({ title, isOpen, onToggle, children }: AccordionSectionProps) {
  return (
    <div className={`accordion-section ${isOpen ? 'accordion-section--open' : ''}`}>
      <button
        type="button"
        className="accordion-section__header"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span className="accordion-section__icon">{isOpen ? '▼' : '▶'}</span>
        <span className="accordion-section__title">{title}</span>
      </button>
      {isOpen && <div className="accordion-section__content">{children}</div>}
    </div>
  );
}

export function TutorialPanel() {
  const [openSection, setOpenSection] = useState<string | null>('ollama');

  const toggleSection = useCallback((section: string) => {
    setOpenSection((prev) => (prev === section ? null : section));
  }, []);

  return (
    <div className="tutorial-panel">
      <h3 className="tutorial-panel__title">Setup Guide</h3>
      <p className="tutorial-panel__intro">
        Follow these guides to set up AI integration for conversation and image generation.
      </p>

      <AccordionSection
        title="Installing Ollama"
        isOpen={openSection === 'ollama'}
        onToggle={() => toggleSection('ollama')}
      >
        <div className="tutorial-content">
          <h4>1. Download Ollama</h4>
          <p>
            Visit{' '}
            <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer">
              ollama.ai
            </a>{' '}
            and download the installer for your operating system.
          </p>

          <h4>2. Install and Run</h4>
          <p>Run the installer and follow the prompts. Ollama will run as a background service.</p>

          <h4>3. Pull a Model</h4>
          <p>Open a terminal and run:</p>
          <pre className="tutorial-code">ollama pull llama3.2</pre>
          <p>
            This downloads the Llama 3.2 model (~2GB). For smaller context windows, consider{' '}
            <code>phi3</code> or <code>gemma2:2b</code>.
          </p>

          <h4>4. Test the Connection</h4>
          <p>
            Go to the Ollama tab and click "Test" with the default URL (http://localhost:11434).
            Your models should appear in the dropdown.
          </p>

          <h4>Recommended Models</h4>
          <ul>
            <li>
              <strong>llama3.2</strong> - Good balance of quality and speed
            </li>
            <li>
              <strong>mistral</strong> - Fast, good for dialogue
            </li>
            <li>
              <strong>phi3</strong> - Very small, runs on modest hardware
            </li>
          </ul>
        </div>
      </AccordionSection>

      <AccordionSection
        title="Installing ComfyUI"
        isOpen={openSection === 'comfyui'}
        onToggle={() => toggleSection('comfyui')}
      >
        <div className="tutorial-content">
          <h4>1. Prerequisites</h4>
          <ul>
            <li>Python 3.10 or 3.11</li>
            <li>NVIDIA GPU with CUDA support (recommended)</li>
            <li>Git</li>
          </ul>

          <h4>2. Clone the Repository</h4>
          <pre className="tutorial-code">
            git clone https://github.com/comfyanonymous/ComfyUI.git{'\n'}
            cd ComfyUI
          </pre>

          <h4>3. Install Dependencies</h4>
          <p>For NVIDIA GPUs:</p>
          <pre className="tutorial-code">
            pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121{'\n'}
            pip install -r requirements.txt
          </pre>

          <h4>4. Download a Checkpoint</h4>
          <p>
            Download a Stable Diffusion checkpoint (e.g., from{' '}
            <a href="https://civitai.com" target="_blank" rel="noopener noreferrer">
              Civitai
            </a>
            ) and place it in <code>models/checkpoints/</code>
          </p>

          <h4>5. Run ComfyUI</h4>
          <pre className="tutorial-code">python main.py</pre>
          <p>ComfyUI will start on http://localhost:8188 by default.</p>

          <h4>6. Test the Connection</h4>
          <p>
            Go to the ComfyUI tab and click "Test". Your checkpoints should appear in the dropdown.
          </p>
        </div>
      </AccordionSection>

      <AccordionSection
        title="Custom ComfyUI Workflows"
        isOpen={openSection === 'workflow'}
        onToggle={() => toggleSection('workflow')}
      >
        <div className="tutorial-content">
          <h4>1. Create Your Workflow</h4>
          <p>
            By default, a simple text-to-image workflow is used. To use your own custom pipeline,
            first create and test your workflow in ComfyUI.
          </p>

          <h4>2. Export the Workflow</h4>
          <p>
            Click the <strong>hamburger menu</strong> (☰) in ComfyUI's top bar, or use the{' '}
            <strong>File</strong> menu, then select <strong>"Export (API)"</strong>.
          </p>
          <p>
            <em>Important:</em> You must use "Export (API)", not "Save". The API format is required
            for programmatic generation.
          </p>

          <h4>3. Save to Your Project</h4>
          <p>
            Save the exported file as <code>comfyui-workflow.json</code> in your project's root
            folder (next to mod.json).
          </p>

          <h4>4. Add Placeholders</h4>
          <p>
            Edit the workflow JSON and replace the values you want to be dynamic with these
            placeholders:
          </p>
          <ul>
            <li>
              <code>{'{{prompt}}'}</code> - Positive prompt text
            </li>
            <li>
              <code>{'{{negative_prompt}}'}</code> - Negative prompt text
            </li>
            <li>
              <code>{'{{checkpoint}}'}</code> - Checkpoint model name
            </li>
            <li>
              <code>{'{{steps}}'}</code> - Number of sampling steps
            </li>
            <li>
              <code>{'{{width}}'}</code> - Image width
            </li>
            <li>
              <code>{'{{height}}'}</code> - Image height
            </li>
            <li>
              <code>{'{{seed}}'}</code> - Random seed value
            </li>
          </ul>
        </div>
      </AccordionSection>

      <AccordionSection
        title="Using AI Generation"
        isOpen={openSection === 'usage'}
        onToggle={() => toggleSection('usage')}
      >
        <div className="tutorial-content">
          <h4>Generating Conversations</h4>
          <p>
            With an .ink file open, click the AI Generate button in the toolbar. Choose from:
          </p>
          <ul>
            <li>
              <strong>New</strong> - Create a new conversation from a prompt
            </li>
            <li>
              <strong>Continue</strong> - Extend the current conversation
            </li>
            <li>
              <strong>Branch</strong> - Create an alternative path
            </li>
          </ul>

          <h4>Generating Images</h4>
          <p>
            When ComfyUI is enabled, you can generate character portraits and scene images.
            Images are saved to your project's Images folder.
          </p>

          <h4>Tips for Better Results</h4>
          <ul>
            <li>Be specific in your prompts about tone and character personality</li>
            <li>Use lower temperature (0.3-0.5) for more consistent output</li>
            <li>Use higher temperature (0.8-1.0) for more creative variations</li>
            <li>Start with shorter conversations and iterate</li>
          </ul>

          <h4>Troubleshooting</h4>
          <ul>
            <li>
              <strong>Connection fails:</strong> Ensure the service is running and the URL is
              correct
            </li>
            <li>
              <strong>No models/checkpoints:</strong> Make sure you've downloaded at least one
            </li>
            <li>
              <strong>Generation errors:</strong> Try a smaller model or reduce max tokens
            </li>
          </ul>
        </div>
      </AccordionSection>
    </div>
  );
}

export default TutorialPanel;
