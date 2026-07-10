/**
 * Web Worker para processamento pesado durante a exportação.
 * Evita o travamento da interface do usuário ao converter centenas de mídias para Base64.
 */

self.onmessage = async (e) => {
    const { id, tipo, arquivos } = e.data;
    
    if (tipo === 'gerarBase64') {
        const resultado = {};
        let convertidos = 0;
        
        for (const item of arquivos) {
            const { nome, arquivo } = item;
            try {
                const b64 = await converterParaBase64(arquivo);
                if (b64) resultado[nome] = b64;
            } catch (err) {
                console.warn(`Worker: Falha ao converter ${nome}`, err);
            }
            
            convertidos++;
            // Envia feedback de progresso a cada lote pequeno
            if (convertidos % 5 === 0 || convertidos === arquivos.length) {
                self.postMessage({ 
                    id, 
                    tipo: 'progresso', 
                    convertidos, 
                    total: arquivos.length 
                });
            }
        }
        
        // Envia o resultado final
        self.postMessage({ 
            id, 
            tipo: 'concluido', 
            resultado 
        });
    }
};

/**
 * Converte um Blob/File para Base64
 */
function converterParaBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
