export function converterMarkdownParaLatex(markdown) {
    if (!markdown) return '';
    let latex = String(markdown);

    // Escape basic latex special characters first, EXCEPT the ones we need for formatting
    // Wait, if we escape everything, it's safer. But let's just do a simple replacement for now,
    // assuming the markdown parser will handle the text.
    // Actually, it's better to escape latex first, THEN parse markdown to latex commands.
    
    const escapes = {
        '\\': '\\textbackslash{}',
        '{': '\\{', '}': '\\}',
        '$': '\\$', '&': '\\&',
        '%': '\\%', '#': '\\#',
        '_': '\\_', '^': '\\textasciicircum{}',
        '~': '\\textasciitilde{}',
        '<': '\\textless{}', '>': '\\textgreater{}'
    };

    // Escape latex specials
    latex = latex.replace(/[\\{}$&%#_^~<>]/g, (match) => escapes[match] || match);

    // Markdown Bold
    latex = latex.replace(/\*\*(.*?)\*\*/g, '\\textbf{$1}');
    latex = latex.replace(/__(.*?)__/g, '\\textbf{$1}');

    // Markdown Italic
    latex = latex.replace(/\*(.*?)\*/g, '\\textit{$1}');
    latex = latex.replace(/_(.*?)_/g, '\\textit{$1}');

    // Markdown Headings (up to h3)
    latex = latex.replace(/^### (.*$)/gim, '\\subsubsection*{$1}');
    latex = latex.replace(/^## (.*$)/gim, '\\subsection*{$1}');
    latex = latex.replace(/^# (.*$)/gim, '\\section*{$1}');

    // Tables
    // A very simple table converter
    // E.g.:
    // | Col 1 | Col 2 |
    // | --- | --- |
    // | Val 1 | Val 2 |
    
    const linhas = latex.split('\n');
    let noTabela = false;
    let numCols = 0;
    
    for (let i = 0; i < linhas.length; i++) {
        let linha = linhas[i].trim();
        if (linha.startsWith('|') && linha.endsWith('|')) {
            const cols = linha.substring(1, linha.length - 1).split('|').map(c => c.trim());
            
            // É a linha separadora? (ex: |---|---|)
            if (cols.every(c => /^[\-:]+$/.test(c))) {
                linhas[i] = '\\hline';
                continue;
            }

            if (!noTabela) {
                noTabela = true;
                numCols = cols.length;
                let colDef = 'l'.repeat(numCols);
                linhas[i] = `\\begin{table}[h!]\n\\centering\n\\begin{tabular}{|${colDef.split('').join('|')}|}\n\\hline\n` + cols.join(' & ') + ' \\\\';
            } else {
                linhas[i] = cols.join(' & ') + ' \\\\';
            }
        } else {
            if (noTabela) {
                noTabela = false;
                linhas[i] = '\\hline\n\\end{tabular}\n\\end{table}\n' + linha;
            }
        }
    }
    
    if (noTabela) {
        linhas.push('\\hline\n\\end{tabular}\n\\end{table}');
    }
    
    latex = linhas.join('\n');

    // Listas simples
    // Convert lines starting with "-" or "*" (but not if they were processed as bold/italic)
    let inList = false;
    const finalLines = [];
    for (let line of latex.split('\n')) {
        if (/^[\-\*]\s+(.*)/.test(line.trim()) && !line.includes('\\begin{tabular}')) {
            if (!inList) {
                finalLines.push('\\begin{itemize}');
                inList = true;
            }
            finalLines.push(line.replace(/^[\-\*]\s+(.*)/, '\\item $1'));
        } else {
            if (inList) {
                finalLines.push('\\end{itemize}');
                inList = false;
            }
            finalLines.push(line);
        }
    }
    if (inList) finalLines.push('\\end{itemize}');
    
    latex = finalLines.join('\n\n'); // Markdown paragraphs become latex paragraphs (blank line)
    
    // Clean up multiple newlines
    latex = latex.replace(/\n\n\n+/g, '\n\n');

    return latex;
}
