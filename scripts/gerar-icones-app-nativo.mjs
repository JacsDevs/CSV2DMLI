// Gera android-template-nativo/.../Icones.kt a partir dos ícones SVG do template HTML, para o
// app nativo usar os mesmos desenhos. Uso (na raiz do projeto): node scripts/gerar-icones-app-nativo.mjs
import fs from 'node:fs';
const tpl = fs.readFileSync('config/templates/html-cards/template.html', 'utf8');
const lista = fs.readFileSync('config/templates/html-cards/lista.tmpl', 'utf8');
const nomes = { busca: 'Busca', cards: 'Cards', lista: 'Lista', salvo: 'Salvo', categorias: 'Categorias', ajustes: 'Ajustes',
  som: 'Som', pausa: 'Pausa', play: 'Play', fechar: 'Fechar', info: 'Info', chevron: 'Chevron', 'seta-esquerda': 'Voltar',
  acessibilidade: 'Acessibilidade', olho: 'Olho', 'coluna-1': 'Coluna1', 'coluna-2': 'Coluna2' };
const num = (v) => Number(v);
const attr = (tag, a) => { const m = tag.match(new RegExp('\\s' + a + '="([^"]*)"')); return m ? m[1] : null; };
function formas(conteudo) {
  const out = [];
  for (const m of conteudo.matchAll(/<(path|circle|rect)\b[^>]*\/?>/g)) {
    const t = m[0], tipo = m[1];
    let d;
    if (tipo === 'path') d = attr(t, 'd');
    else if (tipo === 'circle') {
      const cx = num(attr(t, 'cx')), cy = num(attr(t, 'cy')), r = num(attr(t, 'r'));
      d = `M${cx - r},${cy}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0z`;
    } else {
      const x = num(attr(t, 'x')), y = num(attr(t, 'y')), w = num(attr(t, 'width')), h = num(attr(t, 'height')), rx = num(attr(t, 'rx') || 0);
      d = `M${x + rx},${y}h${w - 2 * rx}a${rx},${rx} 0 0 1 ${rx},${rx}v${h - 2 * rx}a${rx},${rx} 0 0 1 ${-rx},${rx}h${-(w - 2 * rx)}a${rx},${rx} 0 0 1 ${-rx},${-rx}v${-(h - 2 * rx)}a${rx},${rx} 0 0 1 ${rx},${-rx}z`;
    }
    out.push({ d, alfa: attr(t, 'opacity') ? num(attr(t, 'opacity')) : 1, largura: attr(t, 'stroke') !== null ? num(attr(t, 'stroke-width') || 1) : 0 });
  }
  return out;
}
const defs = [];
for (const [id, nome] of Object.entries(nomes)) {
  const m = tpl.match(new RegExp('<symbol id="ic-' + id + '" viewBox="([^"]*)"[^>]*>([^]*?)</symbol>'));
  if (!m) throw new Error('ícone não encontrado: ' + id);
  defs.push({ nome, viewBox: m[1].trim().split(/\s+/).map(Number), formas: formas(m[2]) });
}
// Marcador de salvar (lista.tmpl): contorno com "+" e preenchido com "✓"
for (const [cls, nome] of [['bookmark-icon-add', 'Salvar'], ['bookmark-icon-added', 'SalvoMarcado']]) {
  const m = lista.match(new RegExp('<svg class="' + cls + '"[^>]*viewBox="([^"]*)"[^>]*>([^]*?)</svg>'));
  if (!m) throw new Error('marcador não encontrado: ' + cls);
  defs.push({ nome, viewBox: m[1].trim().split(/\s+/).map(Number), formas: formas(m[2]) });
}
const kt = (s) => JSON.stringify(s);
let saida = `package br.com.csv2dmli.nativo

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.graphics.vector.group
import androidx.compose.ui.unit.dp

// GERADO a partir dos ícones SVG de config/templates/html-cards/template.html e lista.tmpl
// (os mesmos desenhos do app HTML). Para atualizar: node scripts/gerar-icones-app-nativo.mjs

private class Forma(val d: String, val alfa: Float = 1f, val contorno: Float = 0f)

private fun icone(nome: String, x: Float, y: Float, w: Float, h: Float, vararg formas: Forma): ImageVector =
    ImageVector.Builder(nome, 24.dp, 24.dp, w, h).apply {
        group(translationX = -x, translationY = -y) {
            formas.forEach { f ->
                if (f.contorno > 0f) {
                    addPath(
                        addPathNodes(f.d), fill = null, stroke = SolidColor(Color.Black), strokeLineWidth = f.contorno,
                        strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round,
                    )
                } else {
                    addPath(addPathNodes(f.d), fill = SolidColor(Color.Black), fillAlpha = f.alfa)
                }
            }
        }
    }.build()

object Icones {
`;
for (const d of defs) {
  const [x, y, w, h] = d.viewBox;
  const formasKt = d.formas.map(f => `Forma(${kt(f.d)}${f.alfa !== 1 ? `, alfa = ${f.alfa}f` : ''}${f.largura ? `, contorno = ${f.largura}f` : ''})`).join(',\n            ');
  saida += `    val ${d.nome}: ImageVector by lazy {\n        icone(\n            ${kt(d.nome)}, ${x}f, ${y}f, ${w}f, ${h}f,\n            ${formasKt},\n        )\n    }\n`;
}
saida += '}\n';
fs.writeFileSync('android-template-nativo/app/src/main/java/br/com/csv2dmli/nativo/Icones.kt', saida);
console.log(defs.map(d => `${d.nome}(${d.formas.length}${d.formas.some(f => f.largura) ? ',contorno' : ''})`).join(' '));
