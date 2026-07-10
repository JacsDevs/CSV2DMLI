import { limparListaPipe } from '../core/helpers.js';

class ValidadorDados {
    constructor(gerenciadorDados) {
        this.db = gerenciadorDados;
        this.CAMPOS_OBRIGATORIOS = ["ITEM_LEXICAL", "TRADUCAO_SIGNIFICADO", "CAMPO_SEMANTICO"];
    }

    verificarBarras(linha, campos) {
        const contagens = campos.map(campo => {
            const valor = String(linha[campo] || '').trim();
            if (!valor || valor.toLowerCase() === 'nan') return 0;
            return valor.split('|').filter(v => v.trim() !== '').length;
        });
        
        const contagensNaoZero = contagens.filter(c => c > 0);
        if (contagensNaoZero.length <= 1) return [true, ''];
        
        const primeiraContagem = contagensNaoZero[0];
        const todasIguais = contagensNaoZero.every(c => c === primeiraContagem);
        
        if (!todasIguais) {
            const detalhes = campos.map((campo, i) => `${campo}: ${contagens[i]} itens`).join(', ');
            return [false, detalhes];
        }
        return [true, ''];
    }

    validarEdicao(dadosEditados) {
        const erros = [];
        
        // 1. Campos obrigatórios
        const variacoes = dadosEditados.variacoes || [];
        if (variacoes.length === 0 || !variacoes[0].item || variacoes[0].item.trim() === '') {
            erros.push("ITEM_LEXICAL principal é obrigatório.");
        }
        if (!dadosEditados.camposBasicos.TRADUCAO_SIGNIFICADO || String(dadosEditados.camposBasicos.TRADUCAO_SIGNIFICADO).trim() === '') {
            erros.push("TRADUCAO_SIGNIFICADO é obrigatório.");
        }
        if (!dadosEditados.camposBasicos.CAMPO_SEMANTICO || String(dadosEditados.camposBasicos.CAMPO_SEMANTICO).trim() === '') {
            erros.push("CAMPO_SEMANTICO é obrigatório.");
        }

        // 2. Mídias faltantes (VFS)
        const verificarMidia = (tipo, nome, contexto) => {
            const nomeLimpo = String(nome || '').trim();
            if (nomeLimpo && this.db.vfs && !this.db.vfs.obterArquivo(tipo, nomeLimpo)) {
                erros.push(`Aviso: Arquivo de ${contexto} '${nomeLimpo}' não está carregado no sistema.`);
            }
        };

        variacoes.forEach((v, idx) => verificarMidia('audio', v.audio, `Áudio da Variação ${idx + 1}`));
        (dadosEditados.exemplos || []).forEach((e, idx) => verificarMidia('audio', e.audio, `Áudio do Exemplo ${idx + 1}`));
        (dadosEditados.imagens || []).forEach((i, idx) => verificarMidia('imagem', i.img, `Imagem ${idx + 1}`));
        verificarMidia('video', dadosEditados.camposBasicos.ARQUIVO_VIDEO, 'Vídeo');

        return erros;
    }

    diagnosticar() {
        const dadosPlanilha = this.db.dadosPlanilha || [];
        if (dadosPlanilha.length === 0) {
            return { sucesso: false, mensagem: 'Nenhum dado carregado para validar.' };
        }
        
        const dados = dadosPlanilha.map(item => {
            const cb = item.camposBasicos || {};
            const vars = item.variacoes || [];
            const exs = item.exemplos || [];
            const imgs = item.imagens || [];
            
            return {
                ITEM_LEXICAL: vars.map(v => v.item || '').join(' | '),
                CLASSE_GRAMATICAL: cb.CLASSE_GRAMATICAL || '',
                CAMPO_SEMANTICO: cb.CAMPO_SEMANTICO || '',
                SUB_CAMPO_SEMANTICO: cb.SUB_CAMPO_SEMANTICO || '',
                ARQUIVO_SONORO: vars.map(v => v.audio || '').join(' | '),
                TRANSCRICAO_FONEMICA: vars.map(v => v.fone || '').join(' | '),
                TRANSCRICAO_FONETICA: vars.map(v => v.fonet || '').join(' | '),
                TRADUCAO_SIGNIFICADO: cb.TRADUCAO_SIGNIFICADO || '',
                ITENS_RELACIONADOS: cb.ITENS_RELACIONADOS || '',
                DESCRICAO: cb.DESCRICAO || '',
                ARQUIVO_SONORO_EXEMPLO: exs.map(e => e.audio || '').join(' | '),
                TRANSCRICAO_EXEMPLO: exs.map(e => e.trans || '').join(' | '),
                TRADUCAO_EXEMPLO: exs.map(e => e.trad || '').join(' | '),
                IMAGEM: imgs.map(i => i.img || '').join(' | '),
                LEGENDA_IMAGEM: imgs.map(i => i.leg || '').join(' | '),
                ARQUIVO_VIDEO: cb.ARQUIVO_VIDEO || ''
            };
        });

        const erros = {};
        let entradasSemAudio = 0, entradasSemImagem = 0, entradasSemVideo = 0;

        const arqAudioTabela = new Map();
        const arqVideoTabela = new Map();
        const arqImagemTabela = new Map();

        const vfs = this.db.vfs;
        const audioDisponivel = new Set(vfs ? vfs.obterTodosNomes('audio') : []);
        const imagemDisponivel = new Set(vfs ? vfs.obterTodosNomes('imagem') : []);
        const videoDisponivel = new Set(vfs ? vfs.obterTodosNomes('video') : []);

        dados.forEach((dic, index) => {
            const numeroLinha = index + 2; // +1 pro array, +1 pro cabeçalho no CSV
            const errosLinha = [];

            // Verifica Campos Obrigatórios
            const camposNaoPreenchidos = this.CAMPOS_OBRIGATORIOS.filter(campo => !dic[campo] || String(dic[campo]).trim() === '');
            if (camposNaoPreenchidos.length > 0) errosLinha.push(`Campos não preenchidos: ${camposNaoPreenchidos.join(', ')}`);

            // Validação de Barras (|)
            const resConj1 = this.verificarBarras(dic, ['ITEM_LEXICAL', 'ARQUIVO_SONORO', 'TRANSCRICAO_FONEMICA', 'TRANSCRICAO_FONETICA']);
            if (!resConj1[0]) errosLinha.push(`Erro no uso de barras (item lexical): ${resConj1[1]}`);

            const resConj2 = this.verificarBarras(dic, ['ARQUIVO_SONORO_EXEMPLO', 'TRANSCRICAO_EXEMPLO', 'TRADUCAO_EXEMPLO']);
            if (!resConj2[0]) errosLinha.push(`Erro no uso de barras (exemplos): ${resConj2[1]}`);

            const resConj3 = this.verificarBarras(dic, ['IMAGEM', 'LEGENDA_IMAGEM']);
            if (!resConj3[0]) errosLinha.push(`Erro no uso de barras (imagens): ${resConj3[1]}`);

            if (errosLinha.length > 0) erros[numeroLinha] = errosLinha;

            // Contagem de Mídias Referenciadas
            const addReferencia = (mapa, campo) => {
                limparListaPipe(dic[campo]).forEach(arq => {
                    if (!mapa.has(arq)) mapa.set(arq, new Set());
                    mapa.get(arq).add(numeroLinha);
                });
            };
            addReferencia(arqAudioTabela, 'ARQUIVO_SONORO');
            addReferencia(arqAudioTabela, 'ARQUIVO_SONORO_EXEMPLO');
            addReferencia(arqVideoTabela, 'ARQUIVO_VIDEO');
            addReferencia(arqImagemTabela, 'IMAGEM');

            // Entradas Vazias de Mídia
            if ((!dic["ARQUIVO_SONORO"] || !dic["ARQUIVO_SONORO"].trim()) && 
                (!dic["ARQUIVO_SONORO_EXEMPLO"] || !dic["ARQUIVO_SONORO_EXEMPLO"].trim())) entradasSemAudio++;
            if (!dic["IMAGEM"] || !dic["IMAGEM"].trim()) entradasSemImagem++;
            if (!dic["ARQUIVO_VIDEO"] || !dic["ARQUIVO_VIDEO"].trim()) entradasSemVideo++;
        });

        // Cruzamento
        const midiasFaltando = { audio: [], imagem: [], video: [] };
        const midiasNaoUsadas = { audio: [], imagem: [], video: [] };

        const verificarFaltantes = (mapaTabela, setDisponivel, arrayFaltando) => {
            for (const arq of mapaTabela.keys()) if (!setDisponivel.has(arq)) arrayFaltando.push(arq);
        };
        verificarFaltantes(arqAudioTabela, audioDisponivel, midiasFaltando.audio);
        verificarFaltantes(arqImagemTabela, imagemDisponivel, midiasFaltando.imagem);
        verificarFaltantes(arqVideoTabela, videoDisponivel, midiasFaltando.video);

        const verificarNaoUsadas = (setDisponivel, mapaTabela, arrayNaoUsado) => {
            for (const arq of setDisponivel) if (!mapaTabela.has(arq)) arrayNaoUsado.push(arq);
        };
        verificarNaoUsadas(audioDisponivel, arqAudioTabela, midiasNaoUsadas.audio);
        verificarNaoUsadas(imagemDisponivel, arqImagemTabela, midiasNaoUsadas.imagem);
        verificarNaoUsadas(videoDisponivel, arqVideoTabela, midiasNaoUsadas.video);

        return {
            sucesso: true,
            estatisticas: { totalEntradas: dados.length, audiosRef: arqAudioTabela.size, imagensRef: arqImagemTabela.size, videosRef: arqVideoTabela.size, entradasSemAudio, entradasSemImagem, entradasSemVideo },
            errosValidacao: erros,
            midiasFaltando,
            midiasNaoUsadas,
            totalProblemas: Object.keys(erros).length + midiasFaltando.audio.length + midiasFaltando.imagem.length + midiasFaltando.video.length
        };
    }

    gerarRelatorioHtml(diagnostico) {
        if (!diagnostico.sucesso) return `<div class="error">${diagnostico.mensagem}</div>`;
        
        const { estatisticas, errosValidacao, midiasFaltando, midiasNaoUsadas, totalProblemas } = diagnostico;
        let html = `<div style="font-size: 16px; font-weight: 700; margin-bottom: 12px; color: var(--primary);">📊 ESTATÍSTICAS GERAIS</div>`;
        html += `<div class="report-section"><strong>📊 Total de entradas:</strong> ${estatisticas.totalEntradas}</div>`;
        html += `<div class="report-section"><strong>🎵 Áudios referenciados:</strong> ${estatisticas.audiosRef} | <strong>🖼️ Imagens referenciadas:</strong> ${estatisticas.imagensRef} | <strong>🎬 Vídeos referenciados:</strong> ${estatisticas.videosRef}</div>`;
        html += `<hr style="border-color: var(--border-color); margin: 12px 0;">`;
        html += `<div class="report-section"><strong>📝 Entradas sem áudio:</strong> ${estatisticas.entradasSemAudio} | <strong>🖼️ Entradas sem imagens:</strong> ${estatisticas.entradasSemImagem} | <strong>🎬 Entradas sem vídeos:</strong> ${estatisticas.entradasSemVideo}</div>`;
        
        // Mídias Faltando
        html += `<hr style="border-color: var(--primary); margin: 16px 0;">`;
        html += `<div style="font-size: 16px; font-weight: 700; margin-bottom: 12px; color: var(--primary);">🔍 CRUZAMENTO DE MÍDIAS</div>`;
        const totalFaltando = midiasFaltando.audio.length + midiasFaltando.imagem.length + midiasFaltando.video.length;
        
        if (totalFaltando === 0) {
            html += `<div class="report-section success"><strong>✅ Todas as mídias referenciadas foram encontradas!</strong></div>`;
        } else {
            html += `<div class="report-section error"><strong>⚠️ ${totalFaltando} mídia(s) referenciada(s) não encontrada(s):</strong></div>`;
            if (midiasFaltando.audio.length > 0) html += `<div class="report-section error"><strong>🎵 ÁUDIO (${midiasFaltando.audio.length}):</strong> ${midiasFaltando.audio.join(', ')}</div>`;
            if (midiasFaltando.imagem.length > 0) html += `<div class="report-section error"><strong>🖼️ IMAGEM (${midiasFaltando.imagem.length}):</strong> ${midiasFaltando.imagem.join(', ')}</div>`;
            if (midiasFaltando.video.length > 0) html += `<div class="report-section error"><strong>🎬 VÍDEO (${midiasFaltando.video.length}):</strong> ${midiasFaltando.video.join(', ')}</div>`;
        }
        
        // Mídias Não Usadas
        const totalNaoUsadas = midiasNaoUsadas.audio.length + midiasNaoUsadas.imagem.length + midiasNaoUsadas.video.length;
        if (totalNaoUsadas > 0) {
            html += `<hr style="border-color: var(--border-color); margin: 12px 0;">`;
            html += `<div class="report-section warning"><strong>💡 ${totalNaoUsadas} mídia(s) carregada(s) mas não referenciada(s):</strong></div>`;
            if (midiasNaoUsadas.audio.length > 0) html += `<div class="report-section warning"><strong>🎵 ÁUDIO:</strong> ${midiasNaoUsadas.audio.slice(0, 10).join(', ')}${midiasNaoUsadas.audio.length > 10 ? '...' : ''}</div>`;
            if (midiasNaoUsadas.imagem.length > 0) html += `<div class="report-section warning"><strong>🖼️ IMAGEM:</strong> ${midiasNaoUsadas.imagem.slice(0, 10).join(', ')}${midiasNaoUsadas.imagem.length > 10 ? '...' : ''}</div>`;
            if (midiasNaoUsadas.video.length > 0) html += `<div class="report-section warning"><strong>🎬 VÍDEO:</strong> ${midiasNaoUsadas.video.slice(0, 10).join(', ')}${midiasNaoUsadas.video.length > 10 ? '...' : ''}</div>`;
        }
        
        // Erros de Validação
        html += `<hr style="border-color: var(--primary); margin: 16px 0;">`;
        html += `<div style="font-size: 16px; font-weight: 700; margin-bottom: 12px; color: var(--primary);">✔️ VALIDAÇÃO DE CAMPOS</div>`;
        
        const linhasComErro = Object.keys(errosValidacao);
        if (linhasComErro.length === 0) {
            html += `<div class="report-section success"><strong>✅ Nenhum erro de estrutura encontrado!</strong></div>`;
        } else {
            html += `<div class="report-section error"><strong>⚠️ ${linhasComErro.length} linha(s) com erro(s) de validação:</strong></div>`;
            linhasComErro.forEach(linha => {
                html += `<div class="report-section error" style="margin: 8px 0 8px 10px; border-left: 3px solid #ef4444; padding-left: 12px;"><strong>📄 LINHA ${linha}:</strong><br>`;
                errosValidacao[linha].forEach(erro => html += `<span style="color: #dc2626;">→</span> ${erro}<br>`);
                html += `</div>`;
            });
        }
        
        html += `<hr style="border-color: var(--primary); margin: 16px 0;">`;
        if (totalProblemas === 0) {
            html += `<div style="text-align: center; padding: 16px; background: #d1fae5; border-radius: 8px; color: #065f46; font-weight: 700; font-size: 16px;">✅ TUDO OK! Nenhuma pendência encontrada.</div>`;
        } else {
            html += `<div style="text-align: center; padding: 16px; background: #fef3c7; border-radius: 8px; color: #92400e; font-weight: 700; font-size: 16px;">⚠️ Total de problemas: ${totalProblemas} (${linhasComErro.length} erros de validação + ${totalFaltando} mídias faltando)</div>`;
        }
        
        return html;
    }

    gerarRelatorioTexto(diagnostico) {
        if (!diagnostico.sucesso) return `ERRO GERAL: ${diagnostico.mensagem}\n`;
        
        const { estatisticas, errosValidacao, midiasFaltando, midiasNaoUsadas, totalProblemas } = diagnostico;
        
        let txt = `====================================================\n`;
        txt += `RELATÓRIO DE VALIDAÇÃO DO DICIONÁRIO\n`;
        txt += `====================================================\n\n`;
        
        txt += `[ ESTATÍSTICAS GERAIS ]\n`;
        txt += `- Total de entradas: ${estatisticas.totalEntradas}\n`;
        txt += `- Áudios referenciados: ${estatisticas.audiosRef}\n`;
        txt += `- Imagens referenciadas: ${estatisticas.imagensRef}\n`;
        txt += `- Vídeos referenciados: ${estatisticas.videosRef}\n\n`;
        
        txt += `- Entradas sem áudio: ${estatisticas.entradasSemAudio}\n`;
        txt += `- Entradas sem imagem: ${estatisticas.entradasSemImagem}\n`;
        txt += `- Entradas sem vídeo: ${estatisticas.entradasSemVideo}\n\n`;
        
        txt += `----------------------------------------------------\n`;
        txt += `[ CRUZAMENTO DE MÍDIAS ]\n`;
        const totalFaltando = midiasFaltando.audio.length + midiasFaltando.imagem.length + midiasFaltando.video.length;
        if (totalFaltando === 0) {
            txt += `✅ Todas as mídias referenciadas foram encontradas!\n\n`;
        } else {
            txt += `⚠️ ${totalFaltando} mídia(s) referenciada(s) não encontrada(s):\n`;
            if (midiasFaltando.audio.length > 0) txt += `  - ÁUDIO: ${midiasFaltando.audio.join(', ')}\n`;
            if (midiasFaltando.imagem.length > 0) txt += `  - IMAGEM: ${midiasFaltando.imagem.join(', ')}\n`;
            if (midiasFaltando.video.length > 0) txt += `  - VÍDEO: ${midiasFaltando.video.join(', ')}\n`;
            txt += `\n`;
        }
        
        const totalNaoUsadas = midiasNaoUsadas.audio.length + midiasNaoUsadas.imagem.length + midiasNaoUsadas.video.length;
        if (totalNaoUsadas > 0) {
            txt += `💡 ${totalNaoUsadas} mídia(s) carregada(s) mas não referenciada(s) na planilha:\n`;
            if (midiasNaoUsadas.audio.length > 0) txt += `  - ÁUDIO: ${midiasNaoUsadas.audio.join(', ')}\n`;
            if (midiasNaoUsadas.imagem.length > 0) txt += `  - IMAGEM: ${midiasNaoUsadas.imagem.join(', ')}\n`;
            if (midiasNaoUsadas.video.length > 0) txt += `  - VÍDEO: ${midiasNaoUsadas.video.join(', ')}\n`;
            txt += `\n`;
        }
        
        txt += `----------------------------------------------------\n`;
        txt += `[ VALIDAÇÃO DE ESTRUTURA E CAMPOS ]\n`;
        const linhasComErro = Object.keys(errosValidacao);
        if (linhasComErro.length === 0) {
            txt += `✅ Nenhum erro de preenchimento obrigatório ou estrutura encontrado!\n\n`;
        } else {
            txt += `⚠️ ${linhasComErro.length} linha(s) com erro(s):\n`;
            linhasComErro.forEach(linha => {
                txt += `  - LINHA ${linha}:\n`;
                errosValidacao[linha].forEach(erro => txt += `      -> ${erro}\n`);
            });
            txt += `\n`;
        }
        
        txt += `====================================================\n`;
        if (totalProblemas === 0) {
            txt += `RESULTADO: ✅ TUDO OK! Nenhuma pendência.\n`;
        } else {
            txt += `RESULTADO: ⚠️ PENDÊNCIAS ENCONTRADAS.\n`;
            txt += `Total de problemas: ${totalProblemas} (${linhasComErro.length} linhas com erro + ${totalFaltando} mídias faltando)\n`;
        }
        
        return txt;
    }
}
export default ValidadorDados;