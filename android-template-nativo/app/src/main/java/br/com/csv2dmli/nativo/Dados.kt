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

data class Acepcao(
    val numero: String,
    val traducao: String,
    val descricao: String,
    val exemplos: List<Exemplo>,
    val imagens: List<Imagem>,
    val videos: List<String>,
    val extras: List<String>,
    val textos: List<Texto>,
)

data class Entrada(
    val id: String,
    val termo: String,
    val classe: String,
    val categoria: String,
    val subcategoria: String,
    val fonemica: String,
    val fonetica: String,
    val pronuncias: List<Pronuncia>,
    val relacionados: String,
    val acepcoes: List<Acepcao>,
) {
    val traducoes: String = acepcoes.map { it.traducao }.filter { it.isNotBlank() }.joinToString("; ")
    val primeiraImagem: String? = acepcoes.firstNotNullOfOrNull { a -> a.imagens.firstOrNull()?.arquivo }
    val chaveTermo: String = normalizar(termo)
    val chaveTraducao: String = normalizar(traducoes)
}

data class Cores(
    val primaria: Long?, val contraste: Long?, val fundo: Long?, val superficie: Long?,
    val texto: Long?, val textoSecundario: Long?, val acento: Long?,
)

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
    /** Categorias na ordem em que aparecem nos dados. */
    val categorias: List<String> = entradas.map { it.categoria }.filter { it.isNotBlank() }.distinct()
}

/** Minúsculas e sem acentos, para a busca. */
fun normalizar(texto: String): String =
    Normalizer.normalize(texto.lowercase(), Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "")

/** Entradas cujo termo ou tradução contém a busca; termos que começam com ela vêm primeiro. */
fun buscar(entradas: List<Entrada>, busca: String): List<Entrada> {
    val chave = normalizar(busca.trim())
    if (chave.isEmpty()) return entradas
    return entradas
        .filter { it.chaveTermo.contains(chave) || it.chaveTraducao.contains(chave) }
        .sortedBy {
            when {
                it.chaveTermo.startsWith(chave) -> 0
                it.chaveTermo.contains(chave) -> 1
                else -> 2
            }
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
        fun cor(chave: String): Long? = o?.optString(chave)?.let(::corHex)
        return Cores(cor("primaria"), cor("contraste"), cor("fundo"), cor("superficie"),
            cor("texto"), cor("textoSecundario"), cor("acento"))
    }

    /** "#rgb" ou "#rrggbb" → 0xFFrrggbb; outros formatos são ignorados (cor padrão do tema). */
    private fun corHex(valor: String): Long? {
        val hex = valor.trim().removePrefix("#")
        val completo = when (hex.length) {
            3 -> hex.map { "$it$it" }.joinToString("")
            6 -> hex
            else -> return null
        }
        return completo.toLongOrNull(16)?.let { 0xFF000000L or it }
    }

    private fun JSONArray?.objetos(): List<JSONObject> =
        if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }

    private fun JSONArray?.textos(): List<String> =
        if (this == null) emptyList() else (0 until length()).map { optString(it) }
}
