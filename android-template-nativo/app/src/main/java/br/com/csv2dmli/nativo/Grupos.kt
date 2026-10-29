package br.com.csv2dmli.nativo

import java.text.Collator
import java.util.Locale

// Agrupamento da lista principal com as mesmas regras do template HTML
// (config/templates/html-cards/template.html: calcularContagemCaminhos, criarTituloCategoria e
// a montagem dos títulos ao percorrer as entradas):
// - ordem por campo semântico ("Outros" quando vazio), subcampos e termo;
// - "Geral" não vira título;
// - nível intermediário sem termos próprios não ganha título: vai como trilha no seguinte ("Aves › Rapina");
// - estilo: 0 = campo (fixo no topo), 1 = subcampo, 2 = demais níveis (com trilha do nível acima).

private const val GERAL = "Geral"
private const val OUTROS = "Outros"
private const val NIVEIS = 8   // CAMPO_SEMANTICO + SUB_CAMPO_SEMANTICO + _1 … _6

sealed interface Linha {
    val chave: String

    /** Nível 0: campo semântico. */
    data class TituloCampo(val nome: String, val caminho: String, val total: Int, val colapsado: Boolean) : Linha {
        override val chave get() = "t:$caminho"
    }

    /** Atalhos para os subcampos, logo abaixo do título do campo. */
    data class Subcampos(val caminho: String, val nomes: List<String>) : Linha {
        override val chave get() = "s:$caminho"
    }

    /** Níveis 1 e 2+ (nivelVisual 1 ou 2). */
    data class Titulo(
        val nivelVisual: Int, val trilha: List<String>, val nome: String,
        val caminho: String, val total: Int, val colapsado: Boolean,
    ) : Linha {
        override val chave get() = "t:$caminho"
    }

    /** Uma linha de cards (1 ou 2 colunas) ou um verbete do modo lista. */
    data class Itens(val entradas: List<Entrada>) : Linha {
        override val chave get() = "e:" + entradas.joinToString(",") { it.id }
    }
}

/** Linhas a exibir e, para os atalhos, o índice do título de cada nome de campo/subcampo. */
data class Grupos(val linhas: List<Linha>, val ancoras: Map<String, Int>, val totalCampos: Map<String, Int>)

private fun valores(e: Entrada): List<String> {
    val v = ArrayList<String>(NIVEIS)
    v.add(e.categoria.ifBlank { OUTROS })
    e.subcategorias.take(NIVEIS - 1).forEach { v.add(it.trim()) }
    while (v.size < NIVEIS) v.add("")
    return v
}

private fun caminho(vals: List<String>, ate: Int) = vals.take(ate + 1).filter { it.isNotEmpty() }.joinToString("|")

val colador: Collator = Collator.getInstance(Locale.forLanguageTag("pt-BR"))

/** Mesma ordem do HTML: campo, subcampos (posição a posição) e termo. */
fun ordenarPorCategoria(entradas: List<Entrada>): List<Entrada> {
    val chaves = entradas.associateWith(::valores)
    return entradas.sortedWith { a, b ->
        val va = chaves.getValue(a)
        val vb = chaves.getValue(b)
        for (i in 0 until NIVEIS) {
            if (va[i] != vb[i]) return@sortedWith colador.compare(va[i], vb[i])
        }
        colador.compare(a.termo, b.termo)
    }
}

/**
 * @param entradas já filtradas (busca, salvos) e ordenadas com [ordenarPorCategoria]
 * @param colunas 1 ou 2 (modo cards); no modo lista, 1
 * @param colapsados caminhos ("Animais|Aves") recolhidos pelo usuário
 */
fun montarGrupos(entradas: List<Entrada>, colunas: Int, colapsados: Set<String>): Grupos {
    val todosVals = entradas.map(::valores)

    // Contagens por caminho (todos os níveis) e de termos diretos de cada caminho
    val contagem = HashMap<String, Int>()
    val direta = HashMap<String, Int>()
    // Árvore para os atalhos: filhos de cada campo (vazio e "Geral" não contam)
    val filhos = LinkedHashMap<String, MutableSet<String>>()
    for (vals in todosVals) {
        for (i in 0 until NIVEIS) {
            if (vals[i].isEmpty()) continue
            val c = caminho(vals, i)
            contagem[c] = (contagem[c] ?: 0) + 1
        }
        val proprios = vals.filter { it.isNotEmpty() }.toMutableList()
        while (proprios.size > 1 && proprios.last() == GERAL) proprios.removeAt(proprios.lastIndex)
        val cd = proprios.joinToString("|")
        direta[cd] = (direta[cd] ?: 0) + 1
        val raiz = vals[0]
        val filho = vals.drop(1).firstOrNull { it.isNotEmpty() && it != GERAL }
        if (filho != null) filhos.getOrPut(raiz) { sortedSetOf(colador) }.add(filho)
    }

    val linhas = ArrayList<Linha>()
    val ancoras = HashMap<String, Int>()
    val totalCampos = LinkedHashMap<String, Int>()
    val pendentes = ArrayList<Entrada>()
    fun descarregar() {
        pendentes.chunked(colunas.coerceAtLeast(1)).forEach { linhas.add(Linha.Itens(it)) }
        pendentes.clear()
    }
    fun ocultoPor(c: String): Boolean {
        val partes = c.split('|')
        return (1 until partes.size).any { j -> partes.take(j).joinToString("|") in colapsados }
    }

    var ultimos = List(NIVEIS) { "" }
    entradas.forEachIndexed { idx, e ->
        val vals = todosVals[idx]
        val mudou = (0 until NIVEIS).firstOrNull { vals[it] != ultimos[it] } ?: -1
        ultimos = vals
        if (mudou != -1) {
            descarregar()
            fun ehTitulo(i: Int) = vals[i].isNotEmpty() && vals[i] != GERAL
            fun agrupavel(i: Int): Boolean {
                if (i == 0 || !ehTitulo(i)) return false
                val temFilho = vals.drop(i + 1).any { it.isNotEmpty() && it != GERAL }
                return temFilho && (direta[caminho(vals, i)] ?: 0) == 0
            }
            val agrupados = ArrayList<String>()
            for (i in 1 until mudou) {
                if (!ehTitulo(i)) continue
                if (agrupavel(i)) agrupados.add(vals[i]) else agrupados.clear()
            }
            for (i in mudou until NIVEIS) {
                if (!ehTitulo(i)) continue
                if (agrupavel(i)) { agrupados.add(vals[i]); continue }
                val c = caminho(vals, i)
                val total = contagem[c] ?: 0
                if (i == 0) totalCampos[vals[0]] = total
                if (!ocultoPor(c)) {
                    val indice = linhas.size
                    ancoras.putIfAbsent(vals[i], indice)
                    agrupados.forEach { ancoras.putIfAbsent(it, indice) }
                    if (i == 0) {
                        linhas.add(Linha.TituloCampo(vals[0], c, total, c in colapsados))
                        val subs = filhos[vals[0]]
                        if (!subs.isNullOrEmpty() && c !in colapsados) linhas.add(Linha.Subcampos(c, subs.toList()))
                    } else {
                        val nivelVisual = minOf(i - agrupados.size, 2)
                        val trilha = when {
                            agrupados.isNotEmpty() -> agrupados.toList()
                            nivelVisual == 2 -> listOfNotNull(vals.take(i).lastOrNull { it.isNotEmpty() && it != GERAL })
                            else -> emptyList()
                        }
                        linhas.add(Linha.Titulo(nivelVisual, trilha, vals[i], c, total, c in colapsados))
                    }
                }
                agrupados.clear()
            }
        }
        // O termo some se algum nível do seu caminho estiver recolhido
        val caminhoTermo = caminho(vals, NIVEIS - 1)
        val partes = caminhoTermo.split('|')
        val oculto = (1..partes.size).any { j -> partes.take(j).joinToString("|") in colapsados }
        if (!oculto) pendentes.add(e)
    }
    descarregar()
    return Grupos(linhas, ancoras, totalCampos)
}
