// ============================================
// CARREGADOR DE PASTA
// LÊ UMA PASTA DE TRABALHO COMPLETA
// ============================================

class CarregadorPasta {
    constructor(configurador, vfs, gerenciador) {
        this.configurador = configurador;
        this.vfs = vfs;
        this.gerenciador = gerenciador;
        this.arquivosEncontrados = {
            projeto: null,
            planilha: null,
            textos: null,
            configuracao: null,
            metadados: null,
            textosExtra: {
                introHtml: null,
                introPdf: null,
                referencia: null,
                alfabeto: null,
                configTxt: null
            },
            audio: [],
            imagem: [],
            video: []
        };
    }

    async carregarPasta(arquivosLista) {
        console.log('📁 Processando pasta com', arquivosLista.length, 'arquivos');
        
        // Ativar modo silencioso para não poluir terminal antes das mídias carregarem
        if (this.gerenciador) {
            this.gerenciador.silenciarAvisosMidia = true;
        }
        
        // Organizar arquivos por tipo e pasta
        const organizados = this._organizarArquivos(arquivosLista);
        
        // Mostrar o que foi encontrado
        this._exibirResumo(organizados);
        
        // 1. Carregar o pacote mestre (Projeto JSON) ou Planilha base
        if (organizados.projeto) {
            await this.gerenciador.carregarProjeto(organizados.projeto);
            this.arquivosEncontrados.projeto = organizados.projeto;
        } else if (organizados.planilha) {
            await this.gerenciador.carregarPlanilha(organizados.planilha);
            this.arquivosEncontrados.planilha = organizados.planilha;
        } else {
            console.warn('⚠️ Nenhuma planilha ou projeto.json encontrado na pasta');
        }
        
        // 2. Carregar textos estruturados (JSON)
        if (organizados.textos) {
            await this._carregarTextos(organizados.textos);
            this.arquivosEncontrados.textos = organizados.textos;
        }
        
        // 3. Carregar configuração local (se existir)
        if (organizados.configuracao) {
            await this._carregarConfiguracaoLocal(organizados.configuracao);
            this.arquivosEncontrados.configuracao = organizados.configuracao;
        }
        
        // 4. Carregar metadados em JSON (se existir)
        if (organizados.metadados) {
            await this._carregarMetadados(organizados.metadados);
            this.arquivosEncontrados.metadados = organizados.metadados;
        }
        
        // 4.5 Carregar arquivos de textos TXT (legados)
        if (organizados.textosExtra.introHtml) {
            await this._carregarTextoGenerico(organizados.textosExtra.introHtml, conteudo => this.gerenciador.setIntroHtml(conteudo));
            this.arquivosEncontrados.textosExtra.introHtml = organizados.textosExtra.introHtml;
            this._atualizarUI('introHtmlDropZone');
        }
        if (organizados.textosExtra.introPdf) {
            await this._carregarTextoGenerico(organizados.textosExtra.introPdf, conteudo => this.gerenciador.setIntroPdf(conteudo));
            this.arquivosEncontrados.textosExtra.introPdf = organizados.textosExtra.introPdf;
            this._atualizarUI('introPdfDropZone');
        }
        if (organizados.textosExtra.referencia) {
            await this._carregarTextoGenerico(organizados.textosExtra.referencia, conteudo => this.gerenciador.setReferencia(conteudo));
            this.arquivosEncontrados.textosExtra.referencia = organizados.textosExtra.referencia;
            this._atualizarUI('referenciaDropZone');
        }
        if (organizados.textosExtra.alfabeto) {
            await this._carregarTextoGenerico(organizados.textosExtra.alfabeto, conteudo => this.gerenciador.setAlfabetoCustomizado(conteudo));
            this.arquivosEncontrados.textosExtra.alfabeto = organizados.textosExtra.alfabeto;
            this._atualizarUI('alfabetoDropZone');
        }
        if (organizados.textosExtra.configTxt) {
            await this._carregarConfiguracaoTXT(organizados.textosExtra.configTxt);
            this.arquivosEncontrados.textosExtra.configTxt = organizados.textosExtra.configTxt;
            this._atualizarUI('configFullDropZone');
        }
        
        // 5. Carregar mídias (áudio, imagem, video)
        const todasMidias = [
            ...organizados.audio,
            ...organizados.imagem,
            ...organizados.video
        ];
        
        // Desativar silenciamento
        if (this.gerenciador) {
            this.gerenciador.silenciarAvisosMidia = false;
        }
        
        if (todasMidias.length > 0) {
            this.gerenciador.adicionarMidias(todasMidias);
            this.arquivosEncontrados.audio = organizados.audio;
            this.arquivosEncontrados.imagem = organizados.imagem;
            this.arquivosEncontrados.video = organizados.video;
        } else {
            if (this.gerenciador) {
                this.gerenciador._reconstruirBanco();
            }
        }
        
        return this.arquivosEncontrados;
    }

    _organizarArquivos(arquivosLista) {
    const resultado = {
        projeto: null,
        planilha: null,
        textos: null,
        configuracao: null,
        metadados: null,
        textosExtra: {
            introHtml: null,
            introPdf: null,
            referencia: null,
            alfabeto: null,
            configTxt: null
        },
        audio: [],
        imagem: [],
        video: []
    };
    
    // Obter o nome da pasta raiz selecionada (primeiro segmento de qualquer caminho)
    let pastaRaiz = null;
    for (const arquivo of arquivosLista) {
        const caminhoCompleto = arquivo.caminhoPersonalizado || arquivo.webkitRelativePath || arquivo.name;
        const partes = caminhoCompleto.split('/');
        if (partes.length > 1) {
            pastaRaiz = partes[0];
            break;
        }
    }
    
    console.log('📁 Pasta raiz selecionada:', pastaRaiz);
    
    const pastasAudio = this.configurador.getPastasMidia('audio');
    const pastasImagem = this.configurador.getPastasMidia('imagem');
    const pastasVideo = this.configurador.getPastasMidia('video');
    
    const nomesPlanilha = this.configurador.getNomesArquivo('planilha');
    const nomesTextos = this.configurador.getNomesArquivo('textos');
    const nomesConfig = this.configurador.getNomesArquivo('configuracao');
    const nomesMetadados = this.configurador.getNomesArquivo('metadados');
    
    for (const arquivo of arquivosLista) {
        const caminhoCompleto = arquivo.caminhoPersonalizado || arquivo.webkitRelativePath || arquivo.name;
        const partes = caminhoCompleto.split('/');
        
        // Remover o nome da pasta raiz do caminho para análise
        let caminhoRelativo = caminhoCompleto;
        let pastaPai = '';
        
        if (partes.length > 1 && partes[0] === pastaRaiz) {
            // Remove a pasta raiz do caminho
            caminhoRelativo = partes.slice(1).join('/');
            pastaPai = partes.length > 2 ? partes[partes.length - 2] : '';
        }
        
        const nomeArquivo = partes[partes.length - 1];
        const extensao = nomeArquivo.split('.').pop().toLowerCase();
        
        // A planilha pode estar na raiz (após remover a pasta selecionada)
        const estaNaRaiz = caminhoRelativo.split('/').length === 1;
        
        // Verificar se é o pacote de recuperação salvo (Projeto JSON)
        if (estaNaRaiz && nomeArquivo.toLowerCase() === 'projeto.json') {
            resultado.projeto = arquivo;
            console.log(`📦 Projeto JSON de recuperação encontrado: ${nomeArquivo}`);
        }
        // Verificar se é planilha raiz normal
        else if (estaNaRaiz && nomesPlanilha.includes(nomeArquivo.toLowerCase())) {
            resultado.planilha = arquivo;
            console.log(`📊 Planilha encontrada: ${nomeArquivo} (na raiz)`);
        }
        // Verificar se é arquivo de textos (na raiz)
        else if (estaNaRaiz && nomesTextos.includes(nomeArquivo.toLowerCase())) {
            resultado.textos = arquivo;
            console.log(`📄 Textos encontrados: ${nomeArquivo}`);
        }
        // Verificar se é configuração local (na raiz)
        else if (estaNaRaiz && (nomesConfig.includes(nomeArquivo.toLowerCase()) || nomeArquivo.toLowerCase() === 'configuracao.txt')) {
            resultado.configuracao = arquivo;
            console.log(`⚙️ Configuração local encontrada: ${nomeArquivo}`);
        }
        // Verificar se é metadados (na raiz)
        else if (estaNaRaiz && nomesMetadados.includes(nomeArquivo.toLowerCase())) {
            resultado.metadados = arquivo;
            console.log(`📝 Metadados encontrados: ${nomeArquivo}`);
        }
        // ARQUIVOS DE TEXTO LEGADOS DA RAIZ (app.js)
        else if (estaNaRaiz && nomeArquivo.toLowerCase() === 'intro_html.txt') {
            resultado.textosExtra.introHtml = arquivo;
            console.log(`📄 Intro HTML encontrado: ${nomeArquivo}`);
        }
        else if (estaNaRaiz && nomeArquivo.toLowerCase() === 'intro_pdf.txt') {
            resultado.textosExtra.introPdf = arquivo;
            console.log(`📄 Intro PDF encontrado: ${nomeArquivo}`);
        }
        else if (estaNaRaiz && nomeArquivo.toLowerCase() === 'referencia.txt') {
            resultado.textosExtra.referencia = arquivo;
            console.log(`📚 Referência encontrada: ${nomeArquivo}`);
        }
        else if (estaNaRaiz && nomeArquivo.toLowerCase() === 'alfabeto.txt') {
            resultado.textosExtra.alfabeto = arquivo;
            console.log(`🔤 Alfabeto encontrado: ${nomeArquivo}`);
        }
        else if (estaNaRaiz && nomeArquivo.toLowerCase() === 'configuracao.txt') {
            resultado.textosExtra.configTxt = arquivo;
            console.log(`⚙️ Configuração TXT antiga encontrada: ${nomeArquivo}`);
        }
        // Verificar se é áudio
        else if (pastasAudio.some(p => pastaPai.toLowerCase().includes(p.toLowerCase()))) {
            if (this.configurador.isExtensaoValida('audio', extensao)) {
                resultado.audio.push(arquivo);
            }
        }
        // Verificar se é imagem
        else if (pastasImagem.some(p => pastaPai.toLowerCase().includes(p.toLowerCase()))) {
            if (this.configurador.isExtensaoValida('imagem', extensao)) {
                resultado.imagem.push(arquivo);
            }
        }
        // Verificar se é vídeo
        else if (pastasVideo.some(p => pastaPai.toLowerCase().includes(p.toLowerCase()))) {
            if (this.configurador.isExtensaoValida('video', extensao)) {
                resultado.video.push(arquivo);
            }
        }
    }
    
    return resultado;
}

    async _carregarTextos(arquivo) {
        try {
            const conteudo = await this._lerArquivoComoTexto(arquivo);
            const dadosJson = JSON.parse(conteudo);
            this.gerenciador.adicionarTextosEstruturados(dadosJson);
            console.log('✅ Textos estruturados carregados');
        } catch(e) {
            console.error('❌ Erro ao carregar textos:', e);
        }
    }

    async _carregarConfiguracaoLocal(arquivo) {
        try {
            const conteudo = await this._lerArquivoComoTexto(arquivo);
            let configLocal = {};

            // Verifica se é o formato TXT antigo ou JSON novo
            if (arquivo.name.toLowerCase().endsWith('.txt')) {
                console.log('🔄 Lendo arquivo de configuração antigo (.txt)...');
                configLocal.metadados = {};
                
                const linhas = conteudo.split('\n');
                linhas.forEach(linha => {
                    const linhaTrim = linha.trim();
                    if (!linhaTrim.startsWith('#') && linhaTrim.includes('=')) {
                        const idx = linhaTrim.indexOf('=');
                        const chave = linhaTrim.substring(0, idx).trim();
                        const valor = linhaTrim.substring(idx + 1).trim();
                        
                        if (chave === 'Titulo-html') configLocal.metadados.html = valor;
                        if (chave === 'Titulo-pdf') configLocal.metadados.pdf = valor;
                        if (chave === 'Autor(es)') configLocal.metadados.autor = valor;
                        if (chave === 'Data do Dicionário') configLocal.metadados.ano = valor;
                        if (chave === 'Versão') configLocal.metadados.versao = valor;
                    }
                });
            } else {
                configLocal = JSON.parse(conteudo);
            }

            if (this.configurador.mesclarConfigLocal) {
                this.configurador.mesclarConfigLocal(configLocal);
            }
            console.log('✅ Configuração local carregada');
        } catch(e) {
            console.error('❌ Erro ao carregar configuração local:', e);
        }
    }

    async _carregarMetadados(arquivo) {
        try {
            const texto = await this._lerArquivoComoTexto(arquivo);
            const metadados = JSON.parse(texto);
            this.gerenciador.setMetadados(metadados);
        } catch (erro) {
            console.error('❌ Erro ao ler metadados.json:', erro);
        }
    }
    
    // ==========================================
    // LEITURA DE TEXTOS LEGADOS (app.js)
    // ==========================================

    async _carregarTextoGenerico(arquivo, callback) {
        try {
            const texto = await this._lerArquivoComoTexto(arquivo);
            callback(texto);
        } catch (erro) {
            console.error(`❌ Erro ao ler ${arquivo.name}:`, erro);
        }
    }

    async _carregarConfiguracaoTXT(arquivo) {
        try {
            const texto = await this._lerArquivoComoTexto(arquivo);
            const linhas = texto.split('\n');
            const mapConfig = {};
            
            linhas.forEach(linha => {
                const parts = linha.split('=');
                if (parts.length >= 2) {
                    const chave = parts[0].trim();
                    const valor = parts.slice(1).join('=').trim();
                    mapConfig[chave] = valor;
                    
                    // Simular comportamento de UI antigo, se aplicável
                    if (chave === 'Midias_inclusas') {
                        const el = document.getElementById('swMidia');
                        if (el) el.checked = (valor === '1');
                    }
                    if (chave === 'Alterar ordem dos campos') {
                        const el = document.getElementById('swSemantic');
                        if (el) el.checked = (valor === '1');
                    }
                    if (chave === 'Manter a ordem alfabética') {
                        const el = document.getElementById('swAlpha');
                        if (el) el.checked = (valor === '2');
                    }
                }
            });
            this.gerenciador.setConfiguracaoTextoLocal(mapConfig);
            console.log('⚙️ Configuracao.txt antigo lido com sucesso.');
        } catch (erro) {
            console.error('❌ Erro ao ler configuracao.txt:', erro);
        }
    }

    _atualizarUI(zoneId) {
        const el = document.getElementById(zoneId);
        if (el) {
            el.classList.add('loaded');
        }
    }

    // ==========================================
    // UTILITÁRIO
    // ==========================================

    _lerArquivoComoTexto(arquivo) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsText(arquivo, 'UTF-8');
        });
    }

    _exibirResumo(organizados) {
        console.log('📋 Resumo da pasta:');
        console.log(`   - Pacote de Projeto: ${organizados.projeto ? '✅' : '❌'}`);
        console.log(`   - Planilha: ${organizados.planilha ? '✅' : '❌'}`);
        console.log(`   - Textos: ${organizados.textos ? '✅' : '❌'}`);
        console.log(`   - Config local: ${organizados.configuracao ? '✅' : '❌'}`);
        console.log(`   - Metadados: ${organizados.metadados ? '✅' : '❌'}`);
        console.log(`   - Áudios: ${organizados.audio.length} arquivos`);
        console.log(`   - Imagens: ${organizados.imagem.length} arquivos`);
        console.log(`   - Vídeos: ${organizados.video.length} arquivos`);
    }
}

export default CarregadorPasta;