const fs = require('fs');
const path = 'concepticon-cldf/concepts.csv';

if (!fs.existsSync(path)) {
    console.log('Arquivo não encontrado:', path);
    process.exit(1);
}

const content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');

const header = lines[0];
const dataLines = lines.slice(1);
// Remove last empty line if exists
if (dataLines[dataLines.length - 1].trim() === '') {
    dataLines.pop();
}

const half = Math.ceil(dataLines.length / 2);

const part1 = [header, ...dataLines.slice(0, half)].join('\n');
const part2 = [header, ...dataLines.slice(half)].join('\n');

fs.writeFileSync('concepticon-cldf/concepts_1.csv', part1);
fs.writeFileSync('concepticon-cldf/concepts_2.csv', part2);

fs.unlinkSync(path);

console.log(`Divisão concluída!`);
console.log(`concepts_1.csv: ${half} linhas`);
console.log(`concepts_2.csv: ${dataLines.length - half} linhas`);
