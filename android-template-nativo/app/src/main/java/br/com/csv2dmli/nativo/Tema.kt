package br.com.csv2dmli.nativo

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/**
 * Cores do app com os mesmos nomes e valores das variáveis CSS do template HTML
 * (config/templates/html-cards/template.html: --cor-fundo, --cor-primaria-light...), para as
 * duas interfaces terem a mesma identidade. As do projeto (config.json) substituem as padrão.
 */
@Immutable
data class Paleta(
    val escuro: Boolean,
    val fundo: Color,
    val fundo2: Color,
    val superficie: Color,
    val superficie2: Color,
    val texto: Color,
    val textoSecundario: Color,
    val borda: Color,
    val bordaForte: Color,
    val primaria: Color,
    val primariaHover: Color,
    val primariaClara: Color,
    val contraste: Color,
    val acento: Color,
    val acentoForte: Color,
    val acentoClaro: Color,
    val perigo: Color,
)

/** Raios do HTML: --raio, --raio-sm (a pílula usa RoundedCornerShape(50)). */
object Raios {
    val normal = 16.dp
    val pequeno = 10.dp
}

private val PADRAO_CLARO = mapOf(
    "fundo" to 0xFFF5EAD8, "fundo2" to 0xFFEFE1C9, "superficie" to 0xFFFFFBF2, "superficie2" to 0xFFF7EEDA,
    "texto" to 0xFF201E1D, "textoSecundario" to 0xFF6D6459, "borda" to 0x1A201E1D, "bordaForte" to 0x2E201E1D,
    "primaria" to 0xFF5C6B41, "primariaHover" to 0xFF47542F, "primariaClara" to 0xFFE6E9D8, "contraste" to 0xFFFFFBF2,
    "acento" to 0xFFC67139, "acentoForte" to 0xFF9D5324, "acentoClaro" to 0xFFF7E2CE, "perigo" to 0xFFA9452C,
)
private val PADRAO_ESCURO = mapOf(
    "fundo" to 0xFF1A1816, "fundo2" to 0xFF14120F, "superficie" to 0xFF262220, "superficie2" to 0xFF302B28,
    "texto" to 0xFFF2E9DB, "textoSecundario" to 0xFFADA190, "borda" to 0x1FF2E9DB, "bordaForte" to 0x38F2E9DB,
    "primaria" to 0xFFA9BD83, "primariaHover" to 0xFFC0D199, "primariaClara" to 0xFF333A29, "contraste" to 0xFF1A1816,
    "acento" to 0xFFE0904F, "acentoForte" to 0xFFF0A869, "acentoClaro" to 0xFF3D2C1E, "perigo" to 0xFFE58A72,
)

fun montarPaleta(config: Config, escuro: Boolean): Paleta {
    val padrao = if (escuro) PADRAO_ESCURO else PADRAO_CLARO
    val proj = if (escuro) config.escuro else config.claro
    fun c(nome: String) = Color(proj[nome] ?: padrao.getValue(nome))
    return Paleta(
        escuro = escuro,
        fundo = c("fundo"), fundo2 = c("fundo2"), superficie = c("superficie"), superficie2 = c("superficie2"),
        texto = c("texto"), textoSecundario = c("textoSecundario"), borda = c("borda"), bordaForte = c("bordaForte"),
        primaria = c("primaria"), primariaHover = c("primariaHover"), primariaClara = c("primariaClara"),
        contraste = c("contraste"), acento = c("acento"), acentoForte = c("acentoForte"),
        acentoClaro = c("acentoClaro"), perigo = c("perigo"),
    )
}

val LocalPaleta = staticCompositionLocalOf { montarPaleta(Config("", "", "", "", "", emptyList(), "", Cores(), Cores()), false) }

enum class ModoTema { SISTEMA, CLARO, ESCURO }

@Composable
fun TemaDicionario(config: Config, modo: ModoTema, conteudo: @Composable () -> Unit) {
    val escuro = when (modo) {
        ModoTema.SISTEMA -> isSystemInDarkTheme()
        ModoTema.CLARO -> false
        ModoTema.ESCURO -> true
    }
    val p = montarPaleta(config, escuro)

    // Telas que ainda usam componentes Material (entrada, ajustes...) seguem a mesma paleta
    val esquema = if (escuro) {
        darkColorScheme(
            primary = p.primaria, onPrimary = p.contraste, primaryContainer = p.primariaClara, onPrimaryContainer = p.texto,
            secondary = p.acento, onSecondary = p.contraste, secondaryContainer = p.primariaClara, onSecondaryContainer = p.texto,
            tertiary = p.acento, tertiaryContainer = p.acentoClaro, onTertiaryContainer = p.texto,
            background = p.fundo, onBackground = p.texto, surface = p.superficie, onSurface = p.texto,
            surfaceVariant = p.superficie2, onSurfaceVariant = p.textoSecundario, outline = p.bordaForte, outlineVariant = p.borda,
            surfaceContainer = p.superficie, surfaceContainerHigh = p.superficie, surfaceContainerHighest = p.superficie2,
            surfaceContainerLow = p.fundo, surfaceContainerLowest = p.fundo, error = p.perigo,
        )
    } else {
        lightColorScheme(
            primary = p.primaria, onPrimary = p.contraste, primaryContainer = p.primariaClara, onPrimaryContainer = p.texto,
            secondary = p.acento, onSecondary = p.contraste, secondaryContainer = p.primariaClara, onSecondaryContainer = p.texto,
            tertiary = p.acento, tertiaryContainer = p.acentoClaro, onTertiaryContainer = p.texto,
            background = p.fundo, onBackground = p.texto, surface = p.superficie, onSurface = p.texto,
            surfaceVariant = p.superficie2, onSurfaceVariant = p.textoSecundario, outline = p.bordaForte, outlineVariant = p.borda,
            surfaceContainer = p.superficie, surfaceContainerHigh = p.superficie, surfaceContainerHighest = p.superficie2,
            surfaceContainerLow = p.fundo, surfaceContainerLowest = p.fundo, error = p.perigo,
        )
    }
    CompositionLocalProvider(LocalPaleta provides p) {
        MaterialTheme(colorScheme = esquema, content = conteudo)
    }
}
