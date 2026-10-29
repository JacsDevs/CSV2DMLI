// Limites de tamanho da Google Play e do pipeline de geração, e a análise
// prévia do projeto exibida no assistente antes de gerar o app.
// Referência: https://support.google.com/googleplay/android-developer/answer/9859372

const MB = 1000 * 1000;             // a Play usa unidades decimais
const GB = 1000 * MB;

export const LIMITES = {
    // Módulo base: 500 MB. Acima de ~450 MB (margem para código, HTML e ícones)
    // as mídias vão para o pacote de recursos install-time (Play Asset Delivery).
    moduloBase: 500 * MB,
    baseMidiaSeguro: 450 * MB,
    // Cada asset pack: 1,5 GB (há um único pacote de mídia no template)
    pacoteRecursos: 1.5 * GB,
    // Acima disso a Play avisa o usuário final antes de baixar por dados móveis
    avisoDadosMoveis: 200 * MB,
    // Formato ZIP sem ZIP64 (AAB, APK e o zip final)
    zip: 0xffffffff,
    // A partir daqui a geração no navegador tende a ser lenta/pesada
    geracaoPesada: 1 * GB,
    // Um arquivo precisa estar inteiro na memória para calcular o SHA-256
    arquivoGrande: 300 * MB,
    // Soma dos pacotes install-time (módulo base incluído)
    instalacaoTotal: 4 * GB,
    // Quantidade de asset packs por app (a documentação do .NET MAUI cita 50; confirmar no Play Console)
    pacotesMax: 50,
};

// Plano de entrega em etapas (DIAGNOSTICO_ANDROID_NATIVO_E_ENTREGA_MIDIAS.md, 5.7)
export const ENTREGA = {
    INSTALACAO: 'install-time',
    SEGUIDA: 'fast-follow',
    DEMANDA: 'on-demand',
};
export const ORCAMENTO_PADRAO = 200 * MB;   // orçamento de instalação (configurável no assistente)
const PACOTE_ALVO = 500 * MB;               // pacotes fast-follow/on-demand: downloads curtos
const AUDIOS_FAST_FOLLOW = 500 * MB;        // acima disso, o resto dos áudios vai on-demand
const TOTAL_VIDEOS_FAST_FOLLOW = 1 * GB;    // projeto até 1 GB: vídeos num único pacote fast-follow
export const ARQUIVO_INDICE_MIDIAS = 'midias-index.json';

// Tamanho aproximado do template (código, recursos, ícones) somado a cada pacote
const TAMANHO_TEMPLATE = 1 * MB;
const MAIORES_EXIBIDOS = 8;

const EXT_AUDIO = /\.(mp3|ogg|oga|wav|m4a|aac|flac|opus|weba)$/i;
const EXT_VIDEO = /\.(mp4|webm|mov|m4v|mkv|ogv|avi)$/i;
const EXT_FOTO  = /\.(jpe?g|png|gif|webp|svg|bmp|avif)$/i;

function tipoDaMidia(caminho) {
    const p = caminho.toLowerCase();
    if (p.startsWith('audio/') || EXT_AUDIO.test(p)) return 'audio';
    if (p.startsWith('video/') || EXT_VIDEO.test(p)) return 'video';
    if (p.startsWith('foto/') || EXT_FOTO.test(p)) return 'foto';
    return 'outros';
}

export function formatarTamanho(bytes) {
    if (bytes >= GB) return `${(bytes / GB).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} GB`;
    if (bytes >= MB) return `${(bytes / MB).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
    if (bytes >= 1000) return `${Math.round(bytes / 1000)} KB`;
    return `${bytes} B`;
}

// Papel de uma mídia sem classificação (modo "HTML pronto"): só pelo tipo do arquivo
const PAPEL_POR_TIPO = { foto: 'imagem', audio: 'pronuncia', video: 'video', outros: 'outros' };
// Ordem dentro de cada pacote e do módulo base
const ORDEM_PAPEL = ['imagem', 'outros', 'pronuncia', 'exemplo', 'video'];

const somar = (itens) => itens.reduce((s, i) => s + i.tamanho, 0);

function agruparPorCategoria(itens) {
    const grupos = new Map();
    for (const item of itens) {
        if (!grupos.has(item.categoria)) grupos.set(item.categoria, []);
        grupos.get(item.categoria).push(item);
    }
    return grupos;
}

// Pronúncias por categoria inteira, na ordem em que as categorias aparecem, até o orçamento
function categoriasAteOrcamento(itens, orcamento) {
    const cabem = [];
    const sobram = [];
    let resta = orcamento;
    for (const lista of agruparPorCategoria(itens).values()) {
        const tamanho = somar(lista);
        if (tamanho <= resta) {
            cabem.push(...lista);
            resta -= tamanho;
        } else {
            sobram.push(...lista);
        }
    }
    return { cabem, sobram };
}

// Divide os itens em blocos de até `limite` bytes (um arquivo maior que o limite fica sozinho)
function dividirEmBlocos(itens, limite) {
    const blocos = [];
    let atual = null;
    for (const item of itens) {
        if (!atual || (atual.length > 0 && somar(atual) + item.tamanho > limite)) {
            atual = [];
            blocos.push(atual);
        }
        atual.push(item);
    }
    return blocos;
}

// Pacotes de até `alvo` bytes, um por categoria (dividida em partes se passar do alvo).
// Com `juntar`, categorias seguidas dividem o mesmo pacote enquanto couberem.
function pacotesPorCategoria(itens, alvo, juntar) {
    const pacotes = [];
    let atual = null;
    for (const [categoria, lista] of agruparPorCategoria(itens)) {
        const tamanhoCategoria = somar(lista);
        const cabeNoAtual = juntar && atual && atual.tamanho + tamanhoCategoria <= alvo;
        if (!cabeNoAtual) atual = null;
        for (const item of lista) {
            if (!atual || (atual.itens.length > 0 && atual.tamanho + item.tamanho > alvo)) {
                atual = { categorias: [], itens: [], tamanho: 0 };
                pacotes.push(atual);
            }
            if (atual.categorias[atual.categorias.length - 1] !== categoria) atual.categorias.push(categoria);
            atual.itens.push(item);
            atual.tamanho += item.tamanho;
        }
    }
    return pacotes;
}

function rotuloCategorias(base, categorias) {
    const nomes = categorias.filter(Boolean);
    if (nomes.length === 0) return base;
    const exibidos = nomes.length > 3 ? `${nomes.slice(0, 3).join(', ')} e mais ${nomes.length - 3}` : nomes.join(', ');
    return `${base} — ${exibidos}`;
}

/**
 * Divide as mídias entre o módulo base e os pacotes de recursos do AAB (Play Asset Delivery).
 *
 * Sem `etapas`, todas as mídias são entregues na instalação: ficam no módulo base enquanto
 * couberem e, acima disso, em pacotes install-time de até 1,5 GB. Com `etapas`, segue o
 * algoritmo de DIAGNOSTICO_ANDROID_NATIVO_E_ENTREGA_MIDIAS.md (5.7): imagens na instalação,
 * depois áudios e vídeos gastando o que sobrar do orçamento, e o resto em pacotes
 * fast-follow ou on-demand.
 *
 * @param {{
 *   midias: Iterable<[string, { size?: number, length?: number }]>,
 *   tamanhoHtml?: number,
 *   etapas?: boolean,
 *   orcamento?: number,
 *   classificacao?: Map<string, { papel: 'imagem'|'pronuncia'|'exemplo'|'video', categoria?: string }>,
 * }} opcoes
 */
export function planejarEntrega({ midias, tamanhoHtml = 0, etapas = false, orcamento = ORCAMENTO_PADRAO, classificacao = new Map() }) {
    const itens = [];
    for (const [caminho, dados] of midias) {
        const c = classificacao.get(caminho);
        itens.push({
            caminho,
            tamanho: (dados && (dados.size ?? dados.length)) || 0,
            papel: (c && c.papel) || PAPEL_POR_TIPO[tipoDaMidia(caminho)],
            categoria: (c && c.categoria) || '',
        });
    }
    itens.sort((a, b) => ORDEM_PAPEL.indexOf(a.papel) - ORDEM_PAPEL.indexOf(b.papel));
    const doPapel = (...papeis) => itens.filter(i => papeis.includes(i.papel));

    const avisos = [];
    const instalacao = [];
    const seguida = [];   // grupos fast-follow: { rotulo, itens }
    let demanda = [];     // itens on-demand por tipo: { rotulo, itens }

    if (!etapas) {
        instalacao.push(...itens);
    } else {
        // 1. Imagens (e arquivos de tipo desconhecido) sempre na instalação
        const imagens = doPapel('imagem', 'outros');
        instalacao.push(...imagens);
        let resta = orcamento - tamanhoHtml - somar(imagens);
        if (resta < 0) {
            avisos.push({ nivel: 'atencao', texto:
                `As imagens somam ${formatarTamanho(somar(imagens))}, acima do orçamento de instalação ` +
                `(${formatarTamanho(orcamento)}). Elas continuam na instalação; reduza-as para diminuir o download inicial.` });
            resta = 0;
        }

        // 2. Áudios: pronúncias têm prioridade sobre exemplos
        const pronuncias = doPapel('pronuncia');
        const exemplos = doPapel('exemplo');
        const totalAudios = somar(pronuncias) + somar(exemplos);
        if (totalAudios <= resta) {
            instalacao.push(...pronuncias, ...exemplos);
            resta -= totalAudios;
        } else if (somar(pronuncias) <= resta) {
            instalacao.push(...pronuncias);
            resta -= somar(pronuncias);
            seguida.push({ rotulo: 'Áudios de exemplos', itens: exemplos });
        } else {
            const { cabem, sobram } = categoriasAteOrcamento(pronuncias, resta);
            instalacao.push(...cabem);
            resta -= somar(cabem);
            const resto = [...sobram, ...exemplos];
            if (totalAudios <= AUDIOS_FAST_FOLLOW) seguida.push({ rotulo: 'Áudios', itens: resto });
            else demanda.push({ rotulo: 'Áudios', itens: resto });
        }

        // 3. Vídeos: na instalação se couberem no que sobrou do orçamento
        const videos = doPapel('video');
        if (somar(videos) <= resta) {
            instalacao.push(...videos);
        } else if (somar(itens) <= TOTAL_VIDEOS_FAST_FOLLOW) {
            seguida.push({ rotulo: 'Vídeos', itens: videos });
        } else {
            demanda.push({ rotulo: 'Vídeos', itens: videos });
        }
        demanda = demanda.filter(g => g.itens.length > 0);
    }

    // Módulo base enquanto couber; senão, pacotes install-time
    const pacotes = [];
    const baseCabe = tamanhoHtml + somar(instalacao) <= LIMITES.baseMidiaSeguro;
    const base = baseCabe ? instalacao : [];
    if (!baseCabe) {
        dividirEmBlocos(instalacao, LIMITES.pacoteRecursos).forEach((bloco, i) => pacotes.push({
            nome: i === 0 ? 'midia_pack' : `midia_pack_${i + 1}`,
            entrega: ENTREGA.INSTALACAO,
            rotulo: 'Mídias da instalação',
            categorias: [],
            itens: bloco,
        }));
    }
    let numeroSeguida = 0;
    for (const grupo of seguida) {
        for (const bloco of dividirEmBlocos(grupo.itens, LIMITES.pacoteRecursos)) {
            if (bloco.length === 0) continue;
            pacotes.push({ nome: `midia_ff_${++numeroSeguida}`, entrega: ENTREGA.SEGUIDA, rotulo: grupo.rotulo, categorias: [], itens: bloco });
        }
    }

    // On-demand por categoria; se passar do limite de pacotes, aumenta o tamanho e junta categorias
    const disponiveis = LIMITES.pacotesMax - pacotes.length;
    let alvo = PACOTE_ALVO;
    let juntar = false;
    let pacotesDemanda;
    for (;;) {
        pacotesDemanda = demanda.flatMap(g => pacotesPorCategoria(g.itens, alvo, juntar).map(p => ({ ...p, rotulo: g.rotulo })));
        if (pacotesDemanda.length <= disponiveis || (juntar && alvo >= LIMITES.pacoteRecursos)) break;
        if (juntar) alvo = Math.min(alvo * 2, LIMITES.pacoteRecursos);
        juntar = true;
    }
    pacotesDemanda.forEach((p, i) => pacotes.push({
        nome: `midia_od_${i + 1}`,
        entrega: ENTREGA.DEMANDA,
        rotulo: rotuloCategorias(p.rotulo, p.categorias),
        categorias: p.categorias,
        itens: p.itens,
    }));

    // Pacotes com o mesmo rótulo (categoria grande dividida em partes) ganham numeração
    const porRotulo = new Map();
    for (const p of pacotes) porRotulo.set(p.rotulo, (porRotulo.get(p.rotulo) || 0) + 1);
    const vistos = new Map();
    for (const p of pacotes) {
        const n = porRotulo.get(p.rotulo);
        if (n > 1) {
            vistos.set(p.rotulo, (vistos.get(p.rotulo) || 0) + 1);
            p.rotulo = `${p.rotulo} (parte ${vistos.get(p.rotulo)} de ${n})`;
        }
    }

    // Limites rígidos
    if (pacotes.length > LIMITES.pacotesMax) {
        avisos.push({ nivel: 'atencao', recusaPlay: true, texto:
            `O plano precisa de ${pacotes.length} pacotes de recursos, acima do limite de ${LIMITES.pacotesMax} da Google Play. ` +
            'O AAB será recusado pelo Play Console; reduza as mídias.' });
    }
    for (const item of itens) {
        if (item.tamanho > LIMITES.pacoteRecursos) {
            avisos.push({ nivel: 'atencao', recusaPlay: true, texto:
                `O arquivo "${item.caminho}" tem ${formatarTamanho(item.tamanho)} e não cabe em um pacote de recursos (1,5 GB). ` +
                'O AAB será recusado pelo Play Console; comprima-o antes de gerar.' });
        }
    }
    const totais = {
        [ENTREGA.INSTALACAO]: tamanhoHtml + TAMANHO_TEMPLATE + somar(instalacao),
        [ENTREGA.SEGUIDA]: 0,
        [ENTREGA.DEMANDA]: 0,
    };
    for (const p of pacotes) {
        p.tamanho = somar(p.itens);
        if (p.entrega !== ENTREGA.INSTALACAO) totais[p.entrega] += p.tamanho;
    }
    if (totais[ENTREGA.INSTALACAO] > LIMITES.instalacaoTotal) {
        avisos.push({ nivel: 'atencao', recusaPlay: true, texto:
            `As mídias entregues na instalação somam ${formatarTamanho(totais[ENTREGA.INSTALACAO])}, acima de 4 GB ` +
            '(limite da Google Play). O APK de instalação direta funciona, mas o AAB será recusado pelo Play Console.' });
    }

    const destinos = new Map();
    for (const p of pacotes) {
        for (const item of p.itens) destinos.set(item.caminho, p.nome);
        p.arquivos = p.itens.map(i => i.caminho);
        delete p.itens;
    }
    return {
        etapas, orcamento,
        base: { tamanho: somar(base), quantidade: base.length },
        pacotes, destinos, totais, avisos,
    };
}

/** Indica se o plano tem pacotes que não são entregues na instalação (exigem suporte no app). */
export function planoTemEtapas(plano) {
    return plano.pacotes.some(p => p.entrega !== ENTREGA.INSTALACAO);
}

/**
 * Conteúdo do midias-index.json gravado no módulo base: pacotes fast-follow/on-demand e,
 * para cada arquivo deles, o pacote e o tamanho. Arquivos da instalação não entram
 * (continuam em file:///android_asset/).
 */
export function gerarIndiceMidias(plano, midias) {
    const tamanhoDe = (caminho) => {
        const dados = midias.get(caminho);
        return (dados && (dados.size ?? dados.length)) || 0;
    };
    const fora = plano.pacotes.filter(p => p.entrega !== ENTREGA.INSTALACAO);
    const arquivos = {};
    for (const p of fora) for (const caminho of p.arquivos) arquivos[caminho] = [p.nome, tamanhoDe(caminho)];
    return {
        versao: 1,
        pacotes: fora.map(p => ({
            nome: p.nome, entrega: p.entrega, rotulo: p.rotulo, categorias: p.categorias,
            tamanho: p.tamanho, quantidade: p.arquivos.length,
        })),
        arquivos,
    };
}

/**
 * Analisa o tamanho do projeto sem ler o conteúdo dos arquivos.
 * @param {{ tamanhoHtml?: number, midias: Iterable<[string, { size?: number, length?: number }]>,
 *   entrega?: { etapas?: boolean, orcamento?: number, classificacao?: Map } }} projeto
 *   midias: pares [caminho no app, File|Blob|Uint8Array]; entrega: opções de planejarEntrega
 */
export function analisarTamanhoProjeto({ tamanhoHtml = 0, midias, entrega = {} }) {
    const porTipo = { audio: 0, foto: 0, video: 0, outros: 0 };
    const quantidade = { audio: 0, foto: 0, video: 0, outros: 0 };
    const lista = [];
    let totalMidias = 0;

    for (const [caminho, dados] of midias) {
        const tamanho = (dados && (dados.size ?? dados.length)) || 0;
        const tipo = tipoDaMidia(caminho);
        porTipo[tipo] += tamanho;
        quantidade[tipo]++;
        totalMidias += tamanho;
        lista.push({ caminho, tamanho, tipo });
    }
    lista.sort((a, b) => b.tamanho - a.tamanho);

    const conteudo = tamanhoHtml + totalMidias;
    const aab = conteudo + TAMANHO_TEMPLATE;
    const apk = conteudo + TAMANHO_TEMPLATE;
    const zip = aab + apk;
    const plano = planejarEntrega({ ...entrega, tamanhoHtml, midias: lista.map(i => [i.caminho, { size: i.tamanho }]) });
    const usarPacoteMidia = plano.pacotes.length > 0;

    const avisos = [];
    let nivel = 'ok';
    const elevar = (n) => {
        const ordem = ['ok', 'info', 'atencao', 'bloqueio'];
        if (ordem.indexOf(n) > ordem.indexOf(nivel)) nivel = n;
    };

    if (zip > LIMITES.zip) {
        elevar('bloqueio');
        avisos.push({ nivel: 'bloqueio', texto:
            `O zip final (AAB + APK) ficaria com cerca de ${formatarTamanho(zip)}, acima do limite de 4 GB do formato ZIP. ` +
            'Reduza ou comprima as mídias antes de gerar.' });
    }
    for (const aviso of plano.avisos) {
        elevar(aviso.nivel);
        avisos.push(aviso);
    }
    const pacotesInstalacao = plano.pacotes.filter(p => p.entrega === ENTREGA.INSTALACAO).length;
    if (pacotesInstalacao > 0) {
        elevar('info');
        avisos.push({ nivel: 'info', texto:
            'As mídias da instalação passam do limite do módulo base da Google Play (500 MB) e serão entregues em ' +
            (pacotesInstalacao > 1 ? `${pacotesInstalacao} pacotes de recursos` : 'um pacote de recursos') +
            ' (Play Asset Delivery, na instalação). Nenhuma ação necessária.' });
    }
    if (planoTemEtapas(plano)) {
        elevar('info');
        avisos.push({ nivel: 'info', texto:
            'Entrega em etapas: parte das mídias fica em pacotes baixados depois da instalação, pelo próprio app ' +
            '(Ajustes › Mídias offline). Só na versão da Google Play; o APK de instalação direta continua com tudo. ' +
            'Ao publicar, o Play Console pede a declaração de "serviço em primeiro plano" (veja o LEIA-ME).' });
    }
    const downloadInstalacao = plano.totais[ENTREGA.INSTALACAO];
    if (downloadInstalacao > LIMITES.avisoDadosMoveis && zip <= LIMITES.zip) {
        elevar('info');
        avisos.push({ nivel: 'info', texto:
            `Download de ~${formatarTamanho(downloadInstalacao)} na instalação: a Google Play avisa quem for instalar por dados móveis (acima de 200 MB).` });
    }
    if (conteudo > LIMITES.geracaoPesada) {
        elevar('atencao');
        avisos.push({ nivel: 'atencao', texto:
            'Projeto grande: a geração pode levar alguns minutos. Feche outras abas e programas pesados; ' +
            'se o navegador travar, use o app desktop.' });
    }
    const maior = lista[0];
    if (maior && maior.tamanho > LIMITES.arquivoGrande) {
        elevar('atencao');
        avisos.push({ nivel: 'atencao', texto:
            `O arquivo "${maior.caminho}" tem ${formatarTamanho(maior.tamanho)} e precisa caber inteiro na memória durante a assinatura. ` +
            'Considere comprimi-lo antes de gerar.' });
    }
    if (conteudo > 50 * MB) {
        avisos.push({ nivel: 'info', texto:
            `Espaço em disco: reserve pelo menos ${formatarTamanho(zip)} livres para salvar o zip (ele contém o AAB e o APK).` });
    }

    return {
        tamanhoHtml, totalMidias, porTipo, quantidade,
        maiores: lista.slice(0, MAIORES_EXIBIDOS),
        estimativas: { aab, apk, zip },
        usarPacoteMidia, plano, nivel, avisos,
    };
}
