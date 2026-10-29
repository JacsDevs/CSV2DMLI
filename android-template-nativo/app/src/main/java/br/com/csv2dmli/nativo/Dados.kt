package br.com.csv2dmli.nativo

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.text.Normalizer

// Contrato com o gerador (packages/exporters/dadosApp.js), versão 1:
//   assets/dados.json   → { versao, entradas: [...] }
//   assets/config.json  → { versao, nome, autor, versaoApp, ano, introducao, referencias, citacao, tema }
// Caminhos de mídia são relativos à pasta assets/ ("audio/x.mp3", "video/y.mp4", "foto/z.jpg")
// ou endereços http(s); ver MidiasOffline.uri().

data class Pronuncia(val arquivo: String, val video: Boolean)
data class Exemplo(val texto: String, val traducao: String, val audio: String)
data class Imagem(val arquivo: String, val legenda: String)
data class Frase(val original: String, val traducao: String)
data class Texto(val titulo: String, val naoLiteral: String, val frases: List<Frase>)

/** No dicionário invertido ("Ordenar por tradução"), a palavra da língua que a acepção traz. */
data class Reversa(val classe: String, val fonemica: String, val fonetica: String, val pronuncia: Pronuncia?)

data class Acepcao(
    val numero: String,
    val traducao: String,
    val descricao: String,
    val exemplos: List<Exemplo>,
    val imagens: List<Imagem>,
    val videos: List<String>,
    val extras: List<String>,
    val textos: List<Texto>,
    val reversa: Reversa? = null,
)

data class Entrada(
    val id: String,
    val termo: String,
    val classe: String,
    val categoria: String,
    val subcategoria: String,
    /** Subcampos por posição (SUB_CAMPO_SEMANTICO, _1 … _6); posições vazias no meio são "". */
    val subcategorias: List<String>,
    val fonemica: String,
    val fonetica: String,
    val pronuncias: List<Pronuncia>,
    val relacionados: String,
    val acepcoes: List<Acepcao>,
) {
    val primeiraImagem: String? = acepcoes.firstNotNullOfOrNull { a -> a.imagens.firstOrNull()?.arquivo }
    /** Campos em que a busca procura, como aplicarFiltrosEBusca() do HTML: termo, classe, campo e
     *  subcampos, traduções e descrições (separados para um trecho não juntar dois campos). */
    val chaveBusca: String = normalizar(
        (listOf(termo, classe, categoria) + subcategorias + acepcoes.flatMap { listOf(it.traducao, it.descricao) })
            .filter { it.isNotBlank() }.joinToString("\u0001"),
    )
    /** Entrada do dicionário invertido (não pode ser salva: não existe nos dados). */
    val invertida: Boolean get() = id.startsWith(PREFIXO_INVERTIDA)

    /** Campo e primeiro subcampo, para a etiqueta da entrada ("Animais › Aves"). */
    val rotuloCategoria: String
        get() = listOf(categoria, subcategorias.firstOrNull { it.isNotBlank() && it != "Geral" }.orEmpty())
            .filter { it.isNotBlank() }.joinToString(" › ")

    /** O filtro de categoria vale para o campo ou qualquer nível de subcampo (como no HTML). */
    fun pertenceA(nome: String) = categoria == nome || subcategorias.any { it.trim() == nome }
}

const val PREFIXO_INVERTIDA = "inv:"

/** Cores do tema do projeto (nomes do config.json → ARGB); as ausentes usam o padrão do HTML (Tema.kt). */
data class Cores(val valores: Map<String, Long> = emptyMap()) {
    operator fun get(nome: String): Long? = valores[nome]
}

data class Config(
    val nome: String,
    val autor: String,
    val versaoApp: String,
    val ano: String,
    val introducao: String,      // HTML simples (vem do editor de introdução do projeto)
    val referencias: List<String>,
    val citacao: String,
    val claro: Cores,
    val escuro: Cores,
)

data class Dicionario(val config: Config, val entradas: List<Entrada>) {
    /** Opções dos filtros de Ajustes (inicializarFiltros do HTML). */
    val campos: List<String> = entradas.map { it.categoria }.filter { it.isNotBlank() }.distinct().sortedWith(colador)
    val classes: List<String> = entradas.map { it.classe }.filter { it.isNotBlank() }.distinct().sortedWith(colador)
}

/** Minúsculas e sem acentos, para a busca. */
fun normalizar(texto: String): String =
    Normalizer.normalize(texto.lowercase(), Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "")

/**
 * Dicionário invertido de "Ordenar por tradução", como o do HTML: cada tradução vira o termo e as
 * palavras da língua que a têm viram as acepções (com classe, transcrição e a primeira pronúncia),
 * mantendo exemplos e mídias. Campo e subcampos vêm da primeira palavra.
 */
fun inverter(entradas: List<Entrada>): List<Entrada> {
    class Grupo(val termo: String, val base: Entrada) { val acepcoes = ArrayList<Acepcao>() }
    val grupos = LinkedHashMap<String, Grupo>()
    val vazia = Acepcao("", "", "", emptyList(), emptyList(), emptyList(), emptyList(), emptyList())
    for (e in entradas) {
        val reversa = Reversa(e.classe, e.fonemica, e.fonetica, e.pronuncias.firstOrNull())
        for (a in e.acepcoes.ifEmpty { listOf(vazia) }) {
            val traducao = a.traducao.trim().ifEmpty { "Sem significado" }
            grupos.getOrPut(traducao.lowercase()) { Grupo(traducao, e) }.acepcoes += a.copy(traducao = e.termo, reversa = reversa)
        }
    }
    return grupos.map { (chave, g) ->
        Entrada(
            id = PREFIXO_INVERTIDA + chave, termo = g.termo, classe = "",
            categoria = g.base.categoria, subcategoria = g.base.subcategoria, subcategorias = g.base.subcategorias,
            fonemica = "", fonetica = "", pronuncias = emptyList(), relacionados = "",
            acepcoes = g.acepcoes.sortedWith { x, y -> colador.compare(x.traducao, y.traducao) },
        )
    }
}

object LeitorDados {
    fun carregar(context: Context): Dicionario {
        val config = lerConfig(JSONObject(lerAsset(context, "config.json")))
        val raiz = JSONObject(lerAsset(context, "dados.json"))
        val entradas = raiz.getJSONArray("entradas").objetos().map(::lerEntrada)
        return Dicionario(config, entradas)
    }

    private fun lerAsset(context: Context, nome: String): String =
        context.assets.open(nome).bufferedReader(Charsets.UTF_8).use { it.readText() }

    private fun lerEntrada(o: JSONObject) = Entrada(
        id = o.optString("id"),
        termo = o.optString("termo"),
        classe = o.optString("classe"),
        categoria = o.optString("categoria"),
        subcategoria = o.optString("subcategoria"),
        subcategorias = o.optJSONArray("subcategorias").textos(),
        fonemica = o.optString("fonemica"),
        fonetica = o.optString("fonetica"),
        pronuncias = o.optJSONArray("pronuncias").objetos().map {
            Pronuncia(it.optString("arquivo"), it.optString("tipo") == "video")
        }.filter { it.arquivo.isNotBlank() },
        relacionados = o.optString("relacionados"),
        acepcoes = o.optJSONArray("acepcoes").objetos().map(::lerAcepcao),
    )

    private fun lerAcepcao(o: JSONObject) = Acepcao(
        numero = o.optString("numero"),
        traducao = o.optString("traducao"),
        descricao = o.optString("descricao"),
        exemplos = o.optJSONArray("exemplos").objetos().map {
            Exemplo(it.optString("texto"), it.optString("traducao"), it.optString("audio"))
        },
        imagens = o.optJSONArray("imagens").objetos().map {
            Imagem(it.optString("arquivo"), it.optString("legenda"))
        }.filter { it.arquivo.isNotBlank() },
        videos = o.optJSONArray("videos").textos().filter { it.isNotBlank() },
        extras = o.optJSONArray("extras").textos().filter { it.isNotBlank() },
        textos = o.optJSONArray("textos").objetos().map { t ->
            Texto(
                titulo = t.optString("titulo"),
                naoLiteral = t.optString("naoLiteral"),
                frases = t.optJSONArray("frases").objetos().map { Frase(it.optString("original"), it.optString("traducao")) },
            )
        },
    )

    private fun lerConfig(o: JSONObject): Config {
        val tema = o.optJSONObject("tema") ?: JSONObject()
        return Config(
            nome = o.optString("nome", "Dicionário"),
            autor = o.optString("autor"),
            versaoApp = o.optString("versaoApp"),
            ano = o.optString("ano"),
            introducao = o.optString("introducao"),
            referencias = o.optJSONArray("referencias").textos(),
            citacao = o.optString("citacao"),
            claro = lerCores(tema.optJSONObject("claro")),
            escuro = lerCores(tema.optJSONObject("escuro")),
        )
    }

    private fun lerCores(o: JSONObject?): Cores {
        if (o == null) return Cores()
        val valores = mutableMapOf<String, Long>()
        o.keys().forEach { chave -> corCss(o.optString(chave))?.let { valores[chave] = it } }
        return Cores(valores)
    }

    /** "#rgb", "#rrggbb" ou "rgb(a)(r, g, b[, a])" → ARGB; outros formatos ficam com a cor padrão. */
    fun corCss(valor: String): Long? {
        val v = valor.trim()
        if (v.startsWith("#")) {
            val hex = v.removePrefix("#")
            val completo = when (hex.length) {
                3 -> hex.map { "$it$it" }.joinToString("")
                6 -> hex
                else -> return null
            }
            return completo.toLongOrNull(16)?.let { 0xFF000000L or it }
        }
        val partes = Regex("rgba?\\(([^)]*)\\)").matchEntire(v)?.groupValues?.get(1)
            ?.split(',')?.map { it.trim() } ?: return null
        if (partes.size < 3) return null
        val (r, g, b) = partes.take(3).map { it.toFloatOrNull()?.toInt()?.coerceIn(0, 255) ?: return null }
        val a = partes.getOrNull(3)?.toFloatOrNull()?.coerceIn(0f, 1f) ?: 1f
        return ((a * 255).toLong() shl 24) or (r.toLong() shl 16) or (g.toLong() shl 8) or b.toLong()
    }

    private fun JSONArray?.objetos(): List<JSONObject> =
        if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }

    private fun JSONArray?.textos(): List<String> =
        if (this == null) emptyList() else (0 until length()).map { optString(it) }
}
