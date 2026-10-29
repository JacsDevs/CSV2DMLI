package br.com.csv2dmli.nativo

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.em
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

// Alto contraste (html[data-tema="contraste"]): fixo, prevalece sobre as cores do projeto
private val CONTRASTE = mapOf(
    "fundo" to 0xFF000000, "fundo2" to 0xFF000000, "superficie" to 0xFF0A0A0A, "superficie2" to 0xFF1F1F1F,
    "texto" to 0xFFFFFFFF, "textoSecundario" to 0xFFF0F0F0, "borda" to 0x8CFFFFFF, "bordaForte" to 0xFFFFFFFF,
    "primaria" to 0xFFFFD60A, "primariaHover" to 0xFFFFF27A, "primariaClara" to 0xFF2E2700, "contraste" to 0xFF000000,
    "acento" to 0xFFFFD60A, "acentoForte" to 0xFFFFF27A, "acentoClaro" to 0xFF2E2700, "perigo" to 0xFFFF8A75,
)

fun montarPaleta(config: Config, escuro: Boolean, altoContraste: Boolean = false): Paleta {
    val padrao = if (altoContraste) CONTRASTE else if (escuro) PADRAO_ESCURO else PADRAO_CLARO
    val proj = if (altoContraste) Cores() else if (escuro) config.escuro else config.claro
    fun c(nome: String) = Color(proj[nome] ?: padrao.getValue(nome))
    return Paleta(
        escuro = escuro || altoContraste,
        fundo = c("fundo"), fundo2 = c("fundo2"), superficie = c("superficie"), superficie2 = c("superficie2"),
        texto = c("texto"), textoSecundario = c("textoSecundario"), borda = c("borda"), bordaForte = c("bordaForte"),
        primaria = c("primaria"), primariaHover = c("primariaHover"), primariaClara = c("primariaClara"),
        contraste = c("contraste"), acento = c("acento"), acentoForte = c("acentoForte"),
        acentoClaro = c("acentoClaro"), perigo = c("perigo"),
    )
}

val LocalPaleta = staticCompositionLocalOf { montarPaleta(Config("", "", "", "", "", emptyList(), "", Cores(), Cores()), false) }

/** "Espaçamento de leitura" ligado (para textos fora do Compose, como a introdução em HTML). */
val LocalEspacamento = compositionLocalOf { false }

enum class ModoTema { SISTEMA, CLARO, ESCURO, CONTRASTE }

/**
 * Tema e preferências de acessibilidade: paleta (claro, escuro ou alto contraste), tamanho do
 * texto (escala sobre a fonte do sistema, como --escala-texto), espaçamento de leitura
 * (html.a11y-espacamento) e animações.
 */
@Composable
fun TemaDicionario(config: Config, a11y: Acessibilidade, conteudo: @Composable () -> Unit) {
    val escuro = when (a11y.tema) {
        ModoTema.SISTEMA -> isSystemInDarkTheme()
        ModoTema.CLARO -> false
        ModoTema.ESCURO, ModoTema.CONTRASTE -> true
    }
    val p = montarPaleta(config, escuro, a11y.tema == ModoTema.CONTRASTE)
    val context = LocalContext.current
    val semAnimacao = a11y.semAnimacao ?: remember { Acessibilidade.sistemaReduzMovimento(context) }
    val densidade = LocalDensity.current

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
    CompositionLocalProvider(
        LocalPaleta provides p,
        LocalSemAnimacao provides semAnimacao,
        LocalEspacamento provides a11y.espacamento,
        LocalDensity provides Density(densidade.density, densidade.fontScale * a11y.escala),
    ) {
        MaterialTheme(colorScheme = esquema) {
            // Mais espaço entre linhas e letras (line-height 1.85, letter-spacing 0.03em). Sempre o
            // mesmo ProvideTextStyle: trocar de ramo recriaria o conteúdo e perderia o estado das telas
            val estilo = LocalTextStyle.current
            ProvideTextStyle(if (a11y.espacamento) estilo.merge(TextStyle(lineHeight = 1.85.em, letterSpacing = 0.03.em)) else estilo, conteudo)
        }
    }
}
