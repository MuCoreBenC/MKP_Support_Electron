const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { spawnSync } = require('child_process');

function normalizeVersion(value) {
  return String(value || '').trim().replace(/^v/i, '');
}

function normalizeDate(value) {
  return String(value || '').trim();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function resetDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  ensureDir(dirPath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + os.EOL, 'utf8');
}

function walkFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const result = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const absolutePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkFiles(absolutePath));
    } else {
      result.push(absolutePath);
    }
  }
  return result;
}

function relativePosix(basePath, targetPath) {
  return path.relative(basePath, targetPath).replace(/\\/g, '/');
}

function sha1(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

function assertExists(targetPath, message) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(message);
  }
}

function buildPatchUrl(version) {
  return `https://gitee.com/MuCoreBenC/MKP_Support_Electron/raw/main/cloud_data/patch_v${normalizeVersion(version)}.zip`;
}

function buildReleaseNotesMarkdown(releaseNotes = []) {
  if (!Array.isArray(releaseNotes) || releaseNotes.length === 0) {
    return '';
  }
  return releaseNotes.map((item) => `- ${String(item || '').trim()}`).join('\n');
}

function parseReleaseNotesMarkdown(markdown) {
  const content = String(markdown || '').replace(/\r/g, '');
  const lines = content.split('\n');
  const items = [];
  let paragraph = [];
  let inCodeBlock = false;

  const flushParagraph = () => {
    const text = paragraph.join(' ').trim();
    if (text) {
      items.push(text);
    }
    paragraph = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      flushParagraph();
      continue;
    }

    if (inCodeBlock) {
      if (line) {
        items.push(line);
      }
      continue;
    }

    if (!line) {
      flushParagraph();
      continue;
    }

    const bulletMatch = line.match(/^[-*+]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      items.push(bulletMatch[1].trim());
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      items.push(orderedMatch[1].trim());
      continue;
    }

    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      items.push(headingMatch[1].trim());
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();

  return items.filter(Boolean);
}

function resolveRuntimePaths(options = {}) {
  const projectRoot = options.projectRoot || path.resolve(__dirname, '../..');
  const cloudDataDir = options.cloudDataDir || path.join(projectRoot, 'cloud_data');
  const releaseRoot = options.releaseRoot || path.join(projectRoot, 'release_upload');
  const packageJsonPath = options.packageJsonPath || path.join(projectRoot, 'package.json');
  const preloadPath = options.preloadPath || path.join(projectRoot, 'preload.js');
  const srcDir = options.srcDir || path.join(projectRoot, 'src');
  const defaultModelsDir = options.defaultModelsDir || path.join(srcDir, 'default_models');
  const presetsDir = options.presetsDir || path.join(cloudDataDir, 'presets');
  const manifestPath = options.manifestPath || path.join(cloudDataDir, 'app_manifest.json');
  const presetsManifestPath = options.presetsManifestPath || path.join(presetsDir, 'presets_manifest.json');
  const uploadCloudDataDir = options.uploadCloudDataDir || path.join(releaseRoot, 'cloud_data');
  const releaseNotePath = options.releaseNotePath || path.join(releaseRoot, 'release_readme.txt');

  return {
    projectRoot,
    cloudDataDir,
    releaseRoot,
    packageJsonPath,
    preloadPath,
    srcDir,
    defaultModelsDir,
    presetsDir,
    manifestPath,
    presetsManifestPath,
    uploadCloudDataDir,
    releaseNotePath
  };
}

function buildHistoryEntryFromLatest(manifest) {
  return {
    version: normalizeVersion(manifest.latestVersion),
    updateType: manifest.updateType || 'hot_update',
    downloadUrl: manifest.downloadUrl || '',
    releaseDate: manifest.releaseDate || '',
    shortDesc: manifest.shortDesc || '',
    canRollback: manifest.canRollback !== false,
    releaseNotes: Array.isArray(manifest.releaseNotes) ? manifest.releaseNotes : [],
    releaseNotesMarkdown: String(
      manifest.releaseNotesMarkdown
      || buildReleaseNotesMarkdown(manifest.releaseNotes || [])
    )
  };
}

function upsertHistory(history, entry) {
  const normalizedVersion = normalizeVersion(entry.version);
  const nextHistory = Array.isArray(history) ? [...history] : [];
  const existingIndex = nextHistory.findIndex((item) => normalizeVersion(item.version) === normalizedVersion);

  if (existingIndex >= 0) {
    nextHistory.splice(existingIndex, 1);
  }

  nextHistory.unshift(entry);
  return nextHistory;
}

function readReleaseEditorState(options = {}) {
  const paths = resolveRuntimePaths(options);
  const packageJson = readJson(paths.packageJsonPath);
  const manifest = readJson(paths.manifestPath);
  const latestVersion = normalizeVersion(manifest.latestVersion || packageJson.version);
  const releaseNotesMarkdown = String(
    manifest.releaseNotesMarkdown
    || buildReleaseNotesMarkdown(manifest.releaseNotes || [])
  );

  return {
    version: latestVersion,
    releaseDate: normalizeDate(manifest.releaseDate || new Date().toISOString().slice(0, 10)),
    shortDesc: String(manifest.shortDesc || ''),
    releaseNotesMarkdown,
    releaseNotes: Array.isArray(manifest.releaseNotes) ? manifest.releaseNotes : [],
    updateType: manifest.updateType || 'hot_update',
    forceUpdate: !!manifest.forceUpdate,
    canRollback: manifest.canRollback !== false,
    downloadUrl: manifest.downloadUrl || buildPatchUrl(latestVersion),
    historyCount: Array.isArray(manifest.history) ? manifest.history.length : 0,
    paths: {
      projectRoot: paths.projectRoot,
      cloudDataDir: paths.cloudDataDir,
      releaseRoot: paths.releaseRoot,
      uploadCloudDataDir: paths.uploadCloudDataDir
    }
  };
}

function saveReleaseEditorState(payload, options = {}) {
  const paths = resolveRuntimePaths(options);
  const packageJson = readJson(paths.packageJsonPath);
  const manifest = readJson(paths.manifestPath);

  const nextVersion = normalizeVersion(payload.version || manifest.latestVersion || packageJson.version);
  const nextDate = normalizeDate(payload.releaseDate || manifest.releaseDate || new Date().toISOString().slice(0, 10));
  const nextShortDesc = String(payload.shortDesc || '').trim();
  const nextMarkdown = String(payload.releaseNotesMarkdown || '').trim();
  const nextReleaseNotes = parseReleaseNotesMarkdown(nextMarkdown);

  if (!nextVersion) {
    throw new Error('Version is required.');
  }
  if (!/^\d+\.\d+\.\d+(?:[-._][A-Za-z0-9]+)?$/.test(nextVersion)) {
    throw new Error('Version format is invalid. Example: 0.2.8 or 3.0.0-r1');
  }
  if (!nextDate) {
    throw new Error('Release date is required.');
  }
  if (!nextShortDesc) {
    throw new Error('Short description is required.');
  }
  if (nextReleaseNotes.length === 0) {
    throw new Error('Release notes cannot be empty.');
  }

  const currentLatestVersion = normalizeVersion(manifest.latestVersion || packageJson.version);
  if (currentLatestVersion && currentLatestVersion !== nextVersion) {
    manifest.history = upsertHistory(manifest.history, buildHistoryEntryFromLatest(manifest));
  }

  manifest.latestVersion = nextVersion;
  manifest.updateType = String(payload.updateType || manifest.updateType || 'hot_update');
  manifest.downloadUrl = buildPatchUrl(nextVersion);
  manifest.forceUpdate = payload.forceUpdate === undefined ? !!manifest.forceUpdate : !!payload.forceUpdate;
  manifest.releaseDate = nextDate;
  manifest.shortDesc = nextShortDesc;
  manifest.canRollback = payload.canRollback === undefined ? manifest.canRollback !== false : !!payload.canRollback;
  manifest.releaseNotes = nextReleaseNotes;
  manifest.releaseNotesMarkdown = nextMarkdown;

  packageJson.version = nextVersion;

  writeJson(paths.manifestPath, manifest);
  writeJson(paths.packageJsonPath, packageJson);

  return {
    success: true,
    version: nextVersion,
    releaseDate: nextDate,
    shortDesc: nextShortDesc,
    releaseNotes: nextReleaseNotes,
    downloadUrl: manifest.downloadUrl
  };
}

function getVersionContext(options = {}) {
  const paths = resolveRuntimePaths(options);
  const manifest = readJson(paths.manifestPath);
  const packageJson = readJson(paths.packageJsonPath);
  const latestVersion = normalizeVersion(manifest.latestVersion || '');
  const packageVersion = normalizeVersion(packageJson.version || '');

  if (!latestVersion) {
    throw new Error('cloud_data/app_manifest.json is missing latestVersion');
  }

  if (packageVersion !== latestVersion) {
    throw new Error(`package.json version ${packageVersion} does not match cloud_data/app_manifest.json version ${latestVersion}`);
  }

  const expectedPatchName = `patch_v${latestVersion}.zip`;
  if (typeof manifest.downloadUrl === 'string' && !manifest.downloadUrl.includes(expectedPatchName)) {
    throw new Error(`cloud_data/app_manifest.json downloadUrl does not point to ${expectedPatchName}`);
  }

  const previousVersion = Array.isArray(manifest.history) && manifest.history.length > 0
    ? normalizeVersion(manifest.history[0].version || '')
    : '';
  const previousPatchPath = previousVersion
    ? path.join(paths.cloudDataDir, `patch_v${previousVersion}.zip`)
    : '';

  return { manifest, latestVersion, previousVersion, previousPatchPath, paths };
}

function buildPreviousPatchEntryMap(previousPatchPath) {
  if (!previousPatchPath || !fs.existsSync(previousPatchPath)) {
    return new Map();
  }

  const zip = new AdmZip(previousPatchPath);
  const entryMap = new Map();
  zip.getEntries().forEach((entry) => {
    if (entry.isDirectory) return;
    entryMap.set(entry.entryName.replace(/\\/g, '/'), sha1(entry.getData()));
  });
  return entryMap;
}

function getLegacyEntryCandidates(paths, localPath, zipEntryPath) {
  const candidates = [zipEntryPath];
  const relativeToSrc = relativePosix(paths.srcDir, localPath);

  if (!relativeToSrc.startsWith('..')) {
    candidates.push(relativeToSrc);
    if (relativeToSrc.startsWith('renderer/')) candidates.push(relativeToSrc);
    if (relativeToSrc.startsWith('main/')) candidates.push(relativeToSrc);
    if (relativeToSrc.startsWith('default_models/')) candidates.push(relativeToSrc);
    if (relativeToSrc === 'input.css') candidates.push('input.css');
  }

  if (localPath === paths.packageJsonPath) candidates.push('package.json');
  if (localPath === paths.preloadPath) candidates.push('preload.js');
  if (localPath === paths.manifestPath) candidates.push('app_manifest.json');

  return Array.from(new Set(candidates));
}

function hasFileChangedAgainstPreviousPatch(paths, localPath, zipEntryPath, previousEntryMap) {
  if (!fs.existsSync(localPath)) return false;
  if (previousEntryMap.size === 0) return true;

  const localHash = sha1(fs.readFileSync(localPath));
  const candidates = getLegacyEntryCandidates(paths, localPath, zipEntryPath);

  for (const candidate of candidates) {
    if (previousEntryMap.has(candidate) && previousEntryMap.get(candidate) === localHash) {
      return false;
    }
  }

  return true;
}

function createFileSpec(localPath, zipEntryPath) {
  return { type: 'file', localPath, zipEntryPath: zipEntryPath.replace(/\\/g, '/') };
}

function createDirectorySpecs(sourceDir, zipPrefix, options = {}) {
  const exclude = Array.isArray(options.exclude) ? options.exclude : [];
  return walkFiles(sourceDir)
    .filter((filePath) => !exclude.some((pattern) => pattern.test(relativePosix(sourceDir, filePath))))
    .map((filePath) => createFileSpec(filePath, `${zipPrefix}/${relativePosix(sourceDir, filePath)}`));
}

function uniqueSpecs(specs) {
  const map = new Map();
  specs.forEach((spec) => {
    const key = `${spec.localPath}=>${spec.zipEntryPath}`;
    map.set(key, spec);
  });
  return Array.from(map.values());
}

function buildModeSpecs(mode, versionContext) {
  const { paths } = versionContext;
  const previousEntryMap = buildPreviousPatchEntryMap(versionContext.previousPatchPath);
  const specs = [];

  const appRuntimeSpecs = uniqueSpecs([
    createFileSpec(paths.packageJsonPath, 'app/package.json'),
    createFileSpec(paths.preloadPath, 'app/preload.js'),
    ...createDirectorySpecs(paths.srcDir, 'app/src', {
      exclude: [/^cloud_data\.lnk$/i]
    })
  ]);

  const appRuntimeNoModelsSpecs = uniqueSpecs([
    createFileSpec(paths.packageJsonPath, 'app/package.json'),
    createFileSpec(paths.preloadPath, 'app/preload.js'),
    ...createDirectorySpecs(paths.srcDir, 'app/src', {
      exclude: [/^cloud_data\.lnk$/i, /^default_models\//i]
    })
  ]);

  const patchManifestSpec = createFileSpec(paths.manifestPath, 'cloud_data/app_manifest.json');
  const presetsManifestSpec = createFileSpec(paths.presetsManifestPath, 'cloud_data/presets/presets_manifest.json');
  const defaultModelSpecs = walkFiles(paths.defaultModelsDir).map((filePath) => (
    createFileSpec(filePath, `app/src/default_models/${relativePosix(paths.defaultModelsDir, filePath)}`)
  ));
  const allPresetSpecs = createDirectorySpecs(paths.presetsDir, 'cloud_data/presets');

  if (mode === '1') {
    const minimalCandidates = uniqueSpecs([
      patchManifestSpec,
      presetsManifestSpec,
      ...appRuntimeNoModelsSpecs,
      ...defaultModelSpecs
    ]);

    return uniqueSpecs(minimalCandidates.filter((spec) => {
      if (spec.localPath === paths.manifestPath) return true;
      return hasFileChangedAgainstPreviousPatch(paths, spec.localPath, spec.zipEntryPath, previousEntryMap);
    }));
  }

  if (mode === '2') {
    specs.push(...appRuntimeNoModelsSpecs, patchManifestSpec, presetsManifestSpec);
    return uniqueSpecs(specs);
  }

  if (mode === '3') {
    specs.push(...appRuntimeSpecs, patchManifestSpec, ...allPresetSpecs);
    return uniqueSpecs(specs);
  }

  return [];
}

function buildPatchZip(version, specs, options = {}) {
  const paths = resolveRuntimePaths(options);
  const patchName = `patch_v${version}.zip`;
  const patchPath = path.join(paths.cloudDataDir, patchName);
  const zip = new AdmZip();

  specs.forEach((spec) => {
    const zipDir = path.posix.dirname(spec.zipEntryPath);
    const zipName = path.posix.basename(spec.zipEntryPath);
    zip.addLocalFile(spec.localPath, zipDir === '.' ? '' : zipDir, zipName);
  });

  zip.writeZip(patchPath);
  return { patchName, patchPath };
}

function collectUploadEntries(mode, patchName, specs, options = {}) {
  const paths = resolveRuntimePaths(options);
  const entries = [
    createFileSpec(paths.manifestPath, 'app_manifest.json'),
    createFileSpec(path.join(paths.cloudDataDir, patchName), patchName)
  ];

  if (mode === '2') {
    entries.push(createFileSpec(paths.presetsManifestPath, 'presets/presets_manifest.json'));
  }

  if (mode === '3') {
    entries.push(...createDirectorySpecs(paths.presetsDir, 'presets'));
  }

  if (mode === '1') {
    const hasPresetsManifest = specs.some((spec) => spec.localPath === paths.presetsManifestPath);
    if (hasPresetsManifest) {
      entries.push(createFileSpec(paths.presetsManifestPath, 'presets/presets_manifest.json'));
    }
  }

  return uniqueSpecs(entries);
}

function writeUploadFolder(mode, patchName, specs, versionContext, options = {}) {
  const paths = resolveRuntimePaths(options);
  resetDir(paths.uploadCloudDataDir);
  const entries = collectUploadEntries(mode, patchName, specs, options);

  entries.forEach((spec) => {
    const targetPath = path.join(paths.uploadCloudDataDir, spec.zipEntryPath.replace(/\//g, path.sep));
    ensureDir(path.dirname(targetPath));
    fs.copyFileSync(spec.localPath, targetPath);
  });

  const noteLines = [
    'Release Readme',
    '',
    `Mode: ${mode}`,
    `Version: ${versionContext.latestVersion}`,
    versionContext.previousVersion ? `Previous hot update version: ${versionContext.previousVersion}` : 'Previous hot update version: none',
    '',
    'Upload steps:',
    '1. Open release_upload\\cloud_data',
    '2. Upload its contents into the remote cloud_data folder',
    '3. The app reads hot update data from cloud_data/app_manifest.json and patch_v*.zip',
    '',
    'Mode summary:',
    '1. Minimal hot update: compare with previous patch and only pack changed core runtime files',
    '2. Standard hot update: pack src, package.json, preload.js, app_manifest.json and presets_manifest.json',
    '   Excludes 3mf files and printer preset json files',
    '3. Full hot update: pack all hot update resources including 3mf and presets',
    '4. Full installer build: build a new dist installer'
  ];

  ensureDir(paths.releaseRoot);
  fs.writeFileSync(paths.releaseNotePath, noteLines.join('\r\n'), 'utf8');
}

function runFullBuild(options = {}) {
  const paths = resolveRuntimePaths(options);
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: paths.projectRoot,
    stdio: 'pipe',
    shell: true
  });

  const stdout = String(result.stdout || '');
  const stderr = String(result.stderr || '');

  if (result.status !== 0) {
    throw new Error((stderr || stdout || 'Full installer build failed.').trim());
  }

  ensureDir(paths.releaseRoot);
  fs.writeFileSync(paths.releaseNotePath, ['Full installer build completed', '', 'Output directory:', 'dist'].join('\r\n'), 'utf8');

  return {
    success: true,
    mode: '4',
    stdout,
    stderr,
    distDir: path.join(paths.projectRoot, 'dist'),
    releaseRoot: paths.releaseRoot
  };
}

function runReleaseMode(mode, options = {}) {
  const paths = resolveRuntimePaths(options);
  assertExists(paths.manifestPath, 'Missing cloud_data/app_manifest.json');
  assertExists(paths.packageJsonPath, 'Missing package.json');
  assertExists(paths.preloadPath, 'Missing preload.js');
  assertExists(paths.srcDir, 'Missing src directory');
  assertExists(paths.presetsDir, 'Missing cloud_data/presets directory');

  if (mode === '4') {
    return runFullBuild(options);
  }

  const versionContext = getVersionContext(options);
  const specs = buildModeSpecs(mode, versionContext);
  if (specs.length === 0) {
    throw new Error('No files were selected for this mode.');
  }

  const { patchName, patchPath } = buildPatchZip(versionContext.latestVersion, specs, options);
  writeUploadFolder(mode, patchName, specs, versionContext, options);

  return {
    success: true,
    mode,
    version: versionContext.latestVersion,
    patchName,
    patchPath,
    changedCount: specs.length,
    uploadCloudDataDir: paths.uploadCloudDataDir,
    releaseNotePath: paths.releaseNotePath
  };
}

module.exports = {
  buildPatchUrl,
  buildReleaseNotesMarkdown,
  parseReleaseNotesMarkdown,
  readReleaseEditorState,
  resolveRuntimePaths,
  runReleaseMode,
  saveReleaseEditorState
};
