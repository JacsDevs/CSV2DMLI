import re

def update_template():
    with open('config/templates/html-cards/template.html', 'r', encoding='utf-8') as f:
        content = f.read()

    processar_code = r"""
        function adaptarDadosParaTemplate(item) {
            let dados = { ...item };
            
            dados.CAMPO_SEMANTICO_EXIBIR = (modoVisualizacao === 'salvos' && item.CAMPO_SEMANTICO) ? true : false;
            
            if (item.AUDIO) {
                const audios = item.AUDIO.split('~').map(a => a.trim()).filter(Boolean);
                dados.AUDIOS_ARRAY = audios.map(a => ({ URL: resolverMidia(a, 'audio') }));
                dados.AUDIO_PRIMEIRO = dados.AUDIOS_ARRAY.length > 0 ? dados.AUDIOS_ARRAY[0].URL : '';
                if (dados.AUDIOS_ARRAY.length > 1) {
                    dados.TEM_AUDIOS_ADICIONAIS = true;
                    dados.AUDIOS_ADICIONAIS = dados.AUDIOS_ARRAY.slice(1);
                }
            }
            
            dados.TEM_INFO_GERAL = !!(item.INDEX || item.CLASSE || item.CAMPO_SEMANTICO || item.SUB_CAMPO_SEMANTICO);
            dados.TEM_PRONUNCIA = !!(item.FONEMICA || item.FONETICA);
            
            if (item.SIGNIFICADOS && item.SIGNIFICADOS.length > 0) {
                dados.SIGNIFICADOS = item.SIGNIFICADOS.map((sig, index) => {
                    let s = { ...sig };
                    s.NUMERO_PONTO = (item.SIGNIFICADOS.length > 1) ? (index + 1) + '.' : '';
                    if (s.EXEMPLOS && s.EXEMPLOS.length > 0) {
                        s.TEM_EXEMPLOS = true;
                        s.EXEMPLOS = s.EXEMPLOS.map(ex => {
                            let e = { ...ex };
                            const exAudio = e.AUDIO || e.AUDIO_ARQUIVO || e.ARQUIVO_AUDIO || e.AUDIO_SRC;
                            if (exAudio) {
                                const auds = exAudio.split('~').map(a => a.trim()).filter(Boolean);
                                e.AUDIOS_ARRAY = auds.map(a => ({ URL: resolverMidia(a, 'audio') }));
                            }
                            return e;
                        });
                    }
                    if (s.IMAGENS && s.IMAGENS.length > 0) {
                        s.TEM_IMAGENS = true;
                        if (!dados.PRIMEIRA_IMAGEM) {
                            dados.PRIMEIRA_IMAGEM = resolverMidia(s.IMAGENS[0].ARQUIVO, 'foto');
                        }
                        s.IMAGENS = s.IMAGENS.map(img => ({
                            ...img, 
                            ARQUIVO: resolverMidia(img.ARQUIVO, 'foto')
                        }));
                    }
                    if (s.VIDEOS && s.VIDEOS.length > 0) {
                        s.TEM_VIDEOS = true;
                        s.VIDEOS = s.VIDEOS.map(vid => ({
                            ...vid,
                            ARQUIVO: resolverMidia(vid.ARQUIVO, 'video')
                        }));
                    }
                    if (s.EXTRAS && s.EXTRAS.length > 0) s.TEM_EXTRAS = true;
                    return s;
                });
            }

            if (item.TEXTOS_ESTRUTURADOS && item.TEXTOS_ESTRUTURADOS.length > 0) {
                dados.TEXTOS_ESTRUTURADOS = item.TEXTOS_ESTRUTURADOS.map(t => {
                    let tex = { ...t };
                    tex.TITULO_EXIBICAO_FALLBACK = tex.TITULO_EXIBICAO || tex.TITULO_BASE || "Texto";
                    tex.ID_TEXTO = tex.ID_TEXTO ? tex.ID_TEXTO.replace(/\s+/g, '_') : 'tx';
                    if (tex.VARIACOES) {
                        tex.VARIACOES = tex.VARIACOES.map(v => {
                            let varItem = { ...v };
                            if (varItem.FRASES) {
                                varItem.FRASES = varItem.FRASES.map(f => {
                                    let fr = { ...f };
                                    if (fr.AUDIO_ARQUIVO) {
                                        fr.AUDIO_ARQUIVO = resolverMidia(fr.AUDIO_ARQUIVO.trim(), 'audio');
                                    }
                                    return fr;
                                });
                            }
                            return varItem;
                        });
                    }
                    return tex;
                });
            }
            
            return dados;
        }

        function processarTemplate(templateStr, dados) {
            function processar(textoAtual, contextoAtual) {
                const regexBloco = /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\\1\}\}/g;
                let textoProcessado = textoAtual.replace(regexBloco, (match, chave, conteudoInterno) => {
                    const valor = contextoAtual[chave];
                    if (valor === undefined || valor === null || valor === '' || valor === false || 
                       (Array.isArray(valor) && valor.length === 0)) {
                        return '';
                    }
                    if (Array.isArray(valor)) {
                        return valor.map(item => {
                            if (typeof item === 'object' && item !== null) {
                                return processar(conteudoInterno, { ...contextoAtual, ...item });
                            }
                            return processar(conteudoInterno, { ...contextoAtual, '.': item });
                        }).join('');
                    }
                    const novoContexto = (typeof valor === 'object' && valor !== null) ? { ...contextoAtual, ...valor } : contextoAtual;
                    return processar(conteudoInterno, novoContexto);
                });
                
                const regexVariavel = /\{\{\s*(\w+)\s*\}\}/g;
                textoProcessado = textoProcessado.replace(regexVariavel, (match, chave) => {
                    const valor = contextoAtual[chave];
                    return (valor !== undefined && valor !== null) ? String(valor) : '';
                });
                return textoProcessado;
            }
            return processar(templateStr, dados).trim();
        }
        
        window.itensSalvos = carregarSalvosPersistidos();
"""
    # Replace the \1 correctly without losing backslashes in python
    processar_code = processar_code.replace(r"\{\{\/\\1\}\}/g", r"\{\{\/\1\}\}/g")
    
    content = content.replace("        window.itensSalvos = carregarSalvosPersistidos();", processar_code)

    card_pattern = re.compile(r'function criarCard\(item\) \{.*?(?=function criarItemLinear)', re.DOTALL)
    new_card = """function criarCard(item) {
            const card = document.createElement('div');
            card.className = 'card';
            card.id = `card-${item.ID || item.TERMO}`;
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');
            const nomeAcessivel = item.TERMO + (item.INDEX ? `, ${item.INDEX}` : '');
            card.setAttribute('aria-label', `${nomeAcessivel}. Abrir detalhes`);

            if (window.templateCard) {
                const dados = adaptarDadosParaTemplate(item);
                card.innerHTML = processarTemplate(window.templateCard, dados);
            } else {
                card.innerHTML = `<div class="card-info"><span>${item.TERMO}</span></div>`;
            }

            card.addEventListener('click', () => abrirModal(item));
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                    e.preventDefault();
                    abrirModal(item);
                }
            });
            return card;
        }

        """
    content = card_pattern.sub(new_card, content)
    
    linear_pattern = re.compile(r'function criarItemLinear\(item\) \{.*?(?=function renderizarCards)', re.DOTALL)
    new_linear = """function criarItemLinear(item) {
            const container = document.createElement('div');
            container.className = 'entrada_lexical section level2';
            container.id = `item-${item.ID || item.TERMO}`;

            if (window.templateLista) {
                const dados = adaptarDadosParaTemplate(item);
                container.innerHTML = processarTemplate(window.templateLista, dados);
            } else {
                container.innerHTML = `<span class='palavra_entrada'>${item.TERMO}</span>`;
            }

            const bookmarkBtn = container.querySelector('.item-bookmark-btn');
            if (bookmarkBtn) {
                bookmarkBtn.classList.toggle('ativo', window.itensSalvos.has(idDoItem(item)));
                bookmarkBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    alternarSalvo(item, bookmarkBtn);
                });
            }

            return container;
        }

        """
    content = linear_pattern.sub(new_linear, content)
    
    modal_pattern = re.compile(r'function preencherModal\(item\) \{.*?(?=function atualizarEstadoNavegacao)', re.DOTALL)
    new_modal = """function preencherModal(item) {
            modalTitulo.textContent = item.TERMO || 'Item';
            if (item.AUDIO) {
                const audioSrc = resolverMidia(item.AUDIO.split('~')[0].trim(), 'audio');
                modalAudioBtn.style.display = 'flex';
                modalAudioBtn.onclick = () => tocarAudio(audioSrc, modalAudioBtn);
            } else {
                modalAudioBtn.style.display = 'none';
            }
            modalBookmarkBtn.classList.toggle('ativo', window.itensSalvos.has(idDoItem(item)));
            modalBookmarkBtn.onclick = () => alternarSalvo(item, modalBookmarkBtn);
            
            if (window.templateEntrada) {
                const dados = adaptarDadosParaTemplate(item);
                modalBody.innerHTML = processarTemplate(window.templateEntrada, dados);
            } else {
                modalBody.innerHTML = `<div>${item.TERMO}</div>`;
            }
            
            const acoesSalvosContainer = document.getElementById('acoes-salvos-container');
            if (acoesSalvosContainer) {
                acoesSalvosContainer.style.display = (modoVisualizacao === 'salvos' && window.itensSalvos.size > 0) ? 'block' : 'none';
            }
        }

        """
    content = modal_pattern.sub(new_modal, content)

    with open('config/templates/html-cards/template.html', 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("Sucesso!")

if __name__ == '__main__':
    update_template()
