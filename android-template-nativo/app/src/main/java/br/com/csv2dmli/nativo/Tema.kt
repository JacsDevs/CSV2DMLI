package br.com.csv2dmli.nativo

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Cores padrão iguais às do template HTML (config/templates/html-cards/template.html),
// substituídas pelas do tema do projeto quando o config.json as traz.
private val PADRAO_CLARO = Cores(0xFF5C6B41, 0xFFFFFBF2, 0xFFF5EAD8, 0xFFFFFBF2, 0xFF201E1D, 0xFF6D6459, 0xFFC67139)
private val PADRAO_ESCURO = Cores(0xFFA9BD83, 0xFF1A1816, 0xFF1A1816, 0xFF262220, 0xFFF2E9DB, 0xFFADA190, 0xFFE0904F)

enum class ModoTema { SISTEMA, CLARO, ESCURO }

@Composable
fun TemaDicionario(config: Config, modo: ModoTema, conteudo: @Composable () -> Unit) {
    val escuro = when (modo) {
        ModoTema.SISTEMA -> isSystemInDarkTheme()
        ModoTema.CLARO -> false
        ModoTema.ESCURO -> true
    }
    val padrao = if (escuro) PADRAO_ESCURO else PADRAO_CLARO
    val proj = if (escuro) config.escuro else config.claro
    fun c(v: Long?, p: Long?) = Color(v ?: p!!)

    val primaria = c(proj.primaria, padrao.primaria)
    val contraste = c(proj.contraste, padrao.contraste)
    val fundo = c(proj.fundo, padrao.fundo)
    val superficie = c(proj.superficie, padrao.superficie)
    val texto = c(proj.texto, padrao.texto)
    val secundario = c(proj.textoSecundario, padrao.textoSecundario)
    val acento = c(proj.acento, padrao.acento)
    val contenedor = primaria.copy(alpha = 0.16f).compositeOver(superficie)

    val esquema = if (escuro) {
        darkColorScheme(
            primary = primaria, onPrimary = contraste, primaryContainer = contenedor, onPrimaryContainer = texto,
            secondary = acento, onSecondary = contraste, secondaryContainer = contenedor, onSecondaryContainer = texto,
            tertiary = acento, tertiaryContainer = contenedor, onTertiaryContainer = texto,
            background = fundo, onBackground = texto, surface = superficie, onSurface = texto,
            surfaceVariant = superficie, onSurfaceVariant = secundario,
            surfaceContainer = superficie, surfaceContainerHigh = superficie, surfaceContainerHighest = superficie,
            surfaceContainerLow = fundo, surfaceContainerLowest = fundo,
        )
    } else {
        lightColorScheme(
            primary = primaria, onPrimary = contraste, primaryContainer = contenedor, onPrimaryContainer = texto,
            secondary = acento, onSecondary = contraste, secondaryContainer = contenedor, onSecondaryContainer = texto,
            tertiary = acento, tertiaryContainer = contenedor, onTertiaryContainer = texto,
            background = fundo, onBackground = texto, surface = superficie, onSurface = texto,
            surfaceVariant = superficie, onSurfaceVariant = secundario,
            surfaceContainer = superficie, surfaceContainerHigh = superficie, surfaceContainerHighest = superficie,
            surfaceContainerLow = fundo, surfaceContainerLowest = fundo,
        )
    }
    MaterialTheme(colorScheme = esquema, content = conteudo)
}

private fun Color.compositeOver(fundo: Color): Color {
    val a = alpha
    return Color(
        red = red * a + fundo.red * (1 - a),
        green = green * a + fundo.green * (1 - a),
        blue = blue * a + fundo.blue * (1 - a),
        alpha = 1f,
    )
}
