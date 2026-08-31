const { ZipArchive } = require('archiver');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function createZip(sourceDirs, outputFile) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputFile);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`✅ Production Zip Created: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`);
      resolve();
    });
    archive.on('error', (err) => reject(err));
    archive.pipe(output);

    for (const { source, dest } of sourceDirs) {
      if (fs.statSync(source).isDirectory()) {
        archive.directory(source, dest);
      } else {
        archive.file(source, { name: dest });
      }
    }
    archive.finalize();
  });
}

async function buildAndPack() {
  console.log('1. Building Backend API (NestJS)...');
  execSync('npm run build', { cwd: path.join(__dirname, 'api'), stdio: 'inherit' });

  console.log('2. Building Frontend (Next.js Static Export)...');
  execSync('npm run build', { cwd: path.join(__dirname, 'web'), stdio: 'inherit' });

  // Prepare package.json for Hostinger production
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'api', 'package.json')));
  pkg.scripts.build = "echo built";
  pkg.scripts.start = "node dist/main.js";
  pkg.scripts["start:prod"] = "node dist/main.js";
  fs.writeFileSync(path.join(__dirname, 'package.deploy.json'), JSON.stringify(pkg, null, 2));

  console.log('3. Packaging final bundle into hostinger-deploy.zip...');
  const zipFile = path.join(__dirname, 'hostinger-deploy.zip');
  if (fs.existsSync(zipFile)) fs.unlinkSync(zipFile);

  await createZip([
    { source: path.join(__dirname, 'api', 'dist'), dest: 'dist' },
    { source: path.join(__dirname, 'api', 'prisma'), dest: 'prisma' },
    { source: path.join(__dirname, 'web', 'out'), dest: 'web/out' },
    { source: path.join(__dirname, 'package.deploy.json'), dest: 'package.json' },
    { source: path.join(__dirname, '.env.production'), dest: '.env' },
  ], zipFile);

  if (fs.existsSync(path.join(__dirname, 'package.deploy.json'))) {
    fs.unlinkSync(path.join(__dirname, 'package.deploy.json'));
  }
}

buildAndPack().catch(console.error);
