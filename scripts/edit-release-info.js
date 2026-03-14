const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');
const { readReleaseEditorState, saveReleaseEditorState } = require('../src/main/release-ops');

const projectRoot = path.resolve(__dirname, '..');
const releaseRoot = path.join(projectRoot, 'release_upload');
const noteDraftPath = path.join(releaseRoot, 'release_notes_input.txt');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function createPrompt() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

function ask(rl, question, defaultValue = '') {
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      const value = String(answer || '').trim();
      resolve(value || defaultValue);
    });
  });
}

function buildDraftText(currentMarkdown = '') {
  const lines = [
    '# Write markdown release notes below',
    '# Save and close this file when finished',
    ''
  ];

  if (currentMarkdown) {
    lines.push(currentMarkdown);
  }

  return lines.join(os.EOL);
}

function openDraftInEditor(filePath) {
  const editorResult = spawnSync('notepad.exe', [filePath], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true
  });

  if (editorResult.status !== 0) {
    throw new Error('Notepad did not close normally.');
  }
}

async function main() {
  ensureDir(releaseRoot);

  const current = readReleaseEditorState();
  const rl = createPrompt();

  try {
    const nextVersion = await ask(rl, 'New version', current.version || '');
    const nextDate = await ask(rl, 'Release date (YYYY-MM-DD)', current.releaseDate || '');
    const nextShortDesc = await ask(rl, 'Short description', current.shortDesc || '');

    fs.writeFileSync(noteDraftPath, buildDraftText(current.releaseNotesMarkdown), 'utf8');
    console.log('');
    console.log(`Release notes editor: ${noteDraftPath}`);
    console.log('Edit markdown release notes, save, then close Notepad.');
    openDraftInEditor(noteDraftPath);

    const releaseNotesMarkdown = fs.readFileSync(noteDraftPath, 'utf8').trim();
    const saved = saveReleaseEditorState({
      version: nextVersion,
      releaseDate: nextDate,
      shortDesc: nextShortDesc,
      forceUpdate: current.forceUpdate,
      canRollback: current.canRollback,
      releaseNotesMarkdown
    });

    console.log('');
    console.log('Release info updated successfully.');
    console.log(`package.json version -> ${saved.version}`);
    console.log(`cloud_data/app_manifest.json latestVersion -> ${saved.version}`);
    console.log(`downloadUrl -> ${saved.downloadUrl}`);
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(`[edit-release-info] ${error.message}`);
  process.exit(1);
});
