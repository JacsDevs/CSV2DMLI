// Licenças conhecidas (tags): escolhidas na interface ou escritas pelo nome em
// configuracao.txt (ex.: "Licenca=CC BY 4.0"). Os exportadores mostram a tag ao
// lado do link quando a URL da licença é uma destas.
export const LICENCAS_CONHECIDAS = [
    { rotulo: 'CC BY 4.0', nome: 'Creative Commons Atribuição 4.0 Internacional', url: 'https://creativecommons.org/licenses/by/4.0/' },
    { rotulo: 'CC BY-SA 4.0', nome: 'Creative Commons Atribuição-CompartilhaIgual 4.0 Internacional', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
    { rotulo: 'CC BY-NC 4.0', nome: 'Creative Commons Atribuição-NãoComercial 4.0 Internacional', url: 'https://creativecommons.org/licenses/by-nc/4.0/' },
    { rotulo: 'CC BY-NC-SA 4.0', nome: 'Creative Commons Atribuição-NãoComercial-CompartilhaIgual 4.0 Internacional', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' },
    { rotulo: 'CC BY-ND 4.0', nome: 'Creative Commons Atribuição-SemDerivações 4.0 Internacional', url: 'https://creativecommons.org/licenses/by-nd/4.0/' },
    { rotulo: 'CC BY-NC-ND 4.0', nome: 'Creative Commons Atribuição-NãoComercial-SemDerivações 4.0 Internacional', url: 'https://creativecommons.org/licenses/by-nc-nd/4.0/' },
    { rotulo: 'CC0 1.0', nome: 'CC0 1.0 Universal (Dedicação ao Domínio Público)', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
];

// "https://www.creativecommons.org/licenses/by/4.0/deed.pt_BR" -> "creativecommons.org/licenses/by/4.0"
function normalizarUrl(url) {
    return String(url || '').trim().toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/[?#].*$/, '')
        .replace(/\/(deed(\.[\w-]+)?|legalcode(\.[\w-]+)?)$/, '')
        .replace(/\/+$/, '');
}

// "CC-BY-SA 4.0", "cc by sa 4.0", "CC BY-SA" -> "ccbysa4.0"
function normalizarRotulo(rotulo) {
    return String(rotulo || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

// Devolve a licença conhecida para uma URL ou tag, ou null. Tag sem versão
// ("CC BY-SA") vale a versão listada.
export function identificarLicenca(valor) {
    const texto = String(valor || '').trim();
    if (!texto) return null;
    const url = normalizarUrl(texto);
    const rotulo = normalizarRotulo(texto);
    return LICENCAS_CONHECIDAS.find(l =>
        normalizarUrl(l.url) === url
        || normalizarRotulo(l.rotulo) === rotulo
        || normalizarRotulo(l.rotulo.replace(/\s+[\d.]+$/, '')) === rotulo
    ) || null;
}
