const { runReleaseMode } = require('../src/main/release-ops');

function main() {
  const mode = String(process.argv[2] || '2').trim();
  if (!['1', '2', '3', '4'].includes(mode)) {
    throw new Error('Invalid mode. Available modes: 1, 2, 3, 4');
  }

  const result = runReleaseMode(mode);

  if (mode === '4') {
    console.log(`Mode: ${mode}`);
    console.log(`Dist: ${result.distDir}`);
    return;
  }

  console.log(`Mode: ${mode}`);
  console.log(`Version: ${result.version}`);
  console.log(`Patch created: ${result.patchPath}`);
  console.log(`Upload folder prepared: ${result.uploadCloudDataDir}`);
  console.log(`Included files: ${result.changedCount}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[release-manager] ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  runReleaseMode
};
