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
};

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

/** Indica se as mídias do AAB devem ir para o pacote de recursos (Play Asset Delivery). */
export function deveUsarPacoteMidia(tamanhoHtml, tamanhoMidias) {
    return tamanhoHtml + tamanhoMidias > LIMITES.baseMidiaSeguro;
}

/**
 * Analisa o tamanho do projeto sem ler o conteúdo dos arquivos.
 * @param {{ tamanhoHtml?: number, midias: Iterable<[string, { size?: number, length?: number }]> }} projeto
 *   midias: pares [caminho no app, File|Blob|Uint8Array]
 */
export function analisarTamanhoProjeto({ tamanhoHtml = 0, midias }) {
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
    const usarPacoteMidia = deveUsarPacoteMidia(tamanhoHtml, totalMidias);

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
    if (totalMidias > LIMITES.pacoteRecursos) {
        elevar('atencao');
        avisos.push({ nivel: 'atencao', texto:
            `As mídias somam ${formatarTamanho(totalMidias)}, acima de 1,5 GB (limite de um pacote de recursos da Google Play). ` +
            'O APK de instalação direta funciona, mas o AAB será recusado pelo Play Console. Otimize as mídias (principalmente vídeos).' });
    } else if (usarPacoteMidia) {
        elevar('info');
        avisos.push({ nivel: 'info', texto:
            'As mídias passam do limite do módulo base da Google Play (500 MB) e serão entregues como pacote de recursos ' +
            '(Play Asset Delivery, na instalação). Nenhuma ação necessária.' });
    }
    if (aab > LIMITES.avisoDadosMoveis && zip <= LIMITES.zip) {
        elevar('info');
        avisos.push({ nivel: 'info', texto:
            `Download de ~${formatarTamanho(aab)}: a Google Play avisa quem for instalar por dados móveis (acima de 200 MB).` });
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
        usarPacoteMidia, nivel, avisos,
    };
}
