package br.com.csv2dmli.nativo

import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge

class MainActivity : ComponentActivity() {

    private lateinit var midias: MidiasOffline
    private lateinit var audio: ReprodutorAudio

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        midias = MidiasOffline(this)
        audio = ReprodutorAudio(this)
        audio.aoFalhar = { midias.aviso.value = "Não foi possível reproduzir o áudio." }
        val prefs = Preferencias(this)
        setContent { App(prefs, midias, audio) }
    }

    override fun onResume() {
        super.onResume()
        // Downloads podem ter avançado com o app em segundo plano
        midias.registrar()
    }

    override fun onPause() {
        midias.desregistrar()
        audio.parar()
        super.onPause()
    }

    override fun onDestroy() {
        audio.liberar()
        super.onDestroy()
    }
}

/** Preferências do usuário: tema, entradas salvas e se o aviso de mídias offline já apareceu. */
class Preferencias(context: Context) {
    private val sp = context.getSharedPreferences("csv2dmli", Context.MODE_PRIVATE)

    var tema: ModoTema
        get() = runCatching { ModoTema.valueOf(sp.getString("tema", null) ?: "") }.getOrDefault(ModoTema.SISTEMA)
        set(v) = sp.edit().putString("tema", v.name).apply()

    var salvos: Set<String>
        get() = sp.getStringSet("salvos", emptySet())?.toSet() ?: emptySet()
        set(v) = sp.edit().putStringSet("salvos", v).apply()

    /** Colunas dos cards (1 ou 2), como o seletor do topo do app HTML. */
    var colunas: Int
        get() = sp.getInt("colunas", 1).coerceIn(1, 2)
        set(v) = sp.edit().putInt("colunas", v).apply()

    /** "Detalhes": classe gramatical e transcrição nos verbetes. */
    var detalhes: Boolean
        get() = sp.getBoolean("detalhes", false)
        set(v) = sp.edit().putBoolean("detalhes", v).apply()

    /** "Ordenar por tradução": dicionário invertido. */
    var ordenarTraducao: Boolean
        get() = sp.getBoolean("ordenar_traducao", false)
        set(v) = sp.edit().putBoolean("ordenar_traducao", v).apply()

    var avisoMidiasMostrado: Boolean
        get() = sp.getBoolean("aviso_midias", false)
        set(v) = sp.edit().putBoolean("aviso_midias", v).apply()
}
