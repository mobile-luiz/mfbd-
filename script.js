// ========== SISTEMA MFBD - VERSÃO 8.6 (LIMPEZA TOTAL APÓS SALVAR/EDITAR) ==========

let usuarioAtual = null;
let historico = [];
let indiceEditando = -1;
let paginaAtual = 1;
let itensPorPagina = 10;
let historicoPaginado = [];
let graficoPrecos, graficoSegmentos, graficoMargens, graficoRisco, graficoTopClientes, graficoTendenciaMargens;
let periodoAtualGraficos = '30d';
let listenerAtivo = false;
let listenerConfigurado = false;
let validacaoSessaoEmAndamento = false;

// Flag para detectar se é um reload/refresh da página
let isPageReload = false;

// Detectar se a página está sendo recarregada
window.addEventListener('beforeunload', function() {
    isPageReload = true;
});

// ========== PROTEÇÃO DE ROTA ==========
// Função para verificar autenticação antes de qualquer ação
function isAuthenticated() {
    const sessao = localStorage.getItem('mfbd_sessao');
    if (!sessao) return false;
    
    try {
        const usuario = JSON.parse(sessao);
        if (usuario && usuario.email) {
            return true;
        }
    } catch(e) {
        return false;
    }
    return false;
}

// Função para forçar logout e redirecionar (mantém a sessão? NÃO - limpa tudo)
function forceLogoutAndRedirect(motivo = 'atualizacao') {
    console.log(`🔒 Forçando logout e redirecionando para login. Motivo: ${motivo}`);
    
    // Limpar todos os dados da sessão
    localStorage.removeItem('mfbd_sessao');
    localStorage.removeItem('historicoSmartPrice');
    
    // Limpar qualquer outro dado de sessão
    sessionStorage.clear();
    
    // Limpar cache
    cacheFirebase = {
        historico: { dados: null, timestamp: null, ultimoId: null },
        configuracoes: { dados: null, timestamp: null },
        usuarios: { dados: null, timestamp: null }
    };
    
    usuarioAtual = null;
    indiceEditando = -1;
    window.ultimoResultado = null;
    historico = [];
    
    // Remover listeners do Firebase
    if (firebaseDatabase) {
        try {
            firebaseDatabase.ref('historico').off();
            firebaseDatabase.ref('historico').off('child_added');
            firebaseDatabase.ref('historico').off('child_changed');
            firebaseDatabase.ref('historico').off('child_removed');
        } catch(e) { console.warn('Erro ao remover listeners:', e); }
    }
    listenerAtivo = false;
    listenerConfigurado = false;
    
    // Destruir gráficos
    destruirGraficos();
    
    // Mostrar tela de login
    mostrarTelaLogin();
    
    // Limpar URL se tiver hash/params
    if (window.location.hash || window.location.search) {
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    console.log('🚪 Sessão encerrada. Redirecionado para login.');
}

// Função que SIMULA logout ao carregar a página
function logoutAoAtualizarPagina() {
    console.log('🔄 Detectado carregamento/atualização da página - Forçando logout');
    
    // Limpar sessão
    localStorage.removeItem('mfbd_sessao');
    localStorage.removeItem('historicoSmartPrice');
    sessionStorage.clear();
    
    // Limpar variáveis globais
    usuarioAtual = null;
    indiceEditando = -1;
    window.ultimoResultado = null;
    historico = [];
    
    // Limpar cache
    cacheFirebase = {
        historico: { dados: null, timestamp: null, ultimoId: null },
        configuracoes: { dados: null, timestamp: null },
        usuarios: { dados: null, timestamp: null }
    };
    
    // Remover listeners
    if (firebaseDatabase) {
        try {
            firebaseDatabase.ref('historico').off();
        } catch(e) {}
    }
    listenerConfigurado = false;
    
    // Mostrar tela de login
    mostrarTelaLogin();
    
    console.log('✅ Logout forçado após atualização da página');
}

// ========== OTIMIZAÇÕES DE CACHE ==========
let cacheFirebase = {
    historico: { dados: null, timestamp: null, ultimoId: null },
    configuracoes: { dados: null, timestamp: null },
    usuarios: { dados: null, timestamp: null }
};
const CACHE_VALIDADE = {
    historico: 30000,
    configuracoes: 60000,
    usuarios: 120000
};

// ========== MAPA DE HORAS PRODUTIVAS POR PERFIL ==========
const HORAS_PRODUTIVAS = {
    'Estag': 140,
    'Jr': 140,
    'Pl': 140,
    'Sr': 120,
    'Coord': 100,
    'Socio': 80
};

// ========== FORMATAÇÃO ==========
function formatarMoeda(valor) {
    if (isNaN(valor) || valor === null || valor === undefined) return 'R$ 0,00';
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

function formatarPercentual(valor) {
    if (isNaN(valor)) return '0%';
    return (valor * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}

function mostrarToast(msg, tipo = 'success') {
    const toastsAntigos = document.querySelectorAll('.toast');
    toastsAntigos.forEach(t => t.remove());
    
    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    toast.innerHTML = `<span>${tipo === 'success' ? '✅' : tipo === 'error' ? '❌' : '⚠️'}</span><span>${msg}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => { 
        toast.style.animation = 'slideOutRight 0.3s'; 
        setTimeout(() => toast.remove(), 300); 
    }, 3000);
}

// ========== LIMPAR OUTPUTS DE CÁLCULO ==========
function limparOutputsCalculo() {
    console.log('🧹 Limpando outputs de cálculo...');
    
    // Limpar preços
    const precoPiso = document.getElementById('preco-piso');
    const precoAlvo = document.getElementById('preco-alvo');
    const precoPremium = document.getElementById('preco-premium');
    
    if (precoPiso) precoPiso.innerHTML = 'R$ 0,00';
    if (precoAlvo) precoAlvo.innerHTML = 'R$ 0,00';
    if (precoPremium) precoPremium.innerHTML = 'R$ 0,00';
    
    // Limpar detalhamento
    const outputCusto = document.getElementById('output-custo');
    const outputImpostos = document.getElementById('output-impostos');
    const outputCs = document.getElementById('output-cs');
    const outputMargemValor = document.getElementById('output-margem-valor');
    const outputMargemPct = document.getElementById('output-margem-pct');
    
    if (outputCusto) outputCusto.innerHTML = 'R$ 0,00';
    if (outputImpostos) outputImpostos.innerHTML = 'R$ 0,00';
    if (outputCs) outputCs.innerHTML = 'R$ 0,00';
    if (outputMargemValor) outputMargemValor.innerHTML = 'R$ 0,00';
    if (outputMargemPct) outputMargemPct.innerHTML = '0%';
    
    // Limpar parcelamento
    const outputEntrada = document.getElementById('output-entrada');
    const outputParcelas = document.getElementById('output-parcelas');
    const outputTotalJuros = document.getElementById('output-total-juros');
    
    if (outputEntrada) outputEntrada.innerHTML = 'R$ 0,00';
    if (outputParcelas) outputParcelas.innerHTML = '1x R$ 0,00';
    if (outputTotalJuros) outputTotalJuros.innerHTML = 'R$ 0,00';
    
    // Limpar composição do preço
    const composicaoCusto = document.getElementById('composicao-custo');
    const composicaoBuffer = document.getElementById('composicao-buffer');
    const composicaoImpostos = document.getElementById('composicao-impostos');
    const composicaoCs = document.getElementById('composicao-cs');
    const composicaoParceiro = document.getElementById('composicao-parceiro');
    const composicaoBase = document.getElementById('composicao-base');
    const composicaoMargem = document.getElementById('composicao-margem');
    
    if (composicaoCusto) composicaoCusto.innerHTML = 'R$ 0,00';
    if (composicaoBuffer) composicaoBuffer.innerHTML = 'R$ 0,00';
    if (composicaoImpostos) composicaoImpostos.innerHTML = 'R$ 0,00';
    if (composicaoCs) composicaoCs.innerHTML = 'R$ 0,00';
    if (composicaoParceiro) composicaoParceiro.innerHTML = 'R$ 0,00';
    if (composicaoBase) composicaoBase.innerHTML = 'R$ 0,00';
    if (composicaoMargem) composicaoMargem.innerHTML = 'R$ 0,00';
    
    // Limpar corpo de cálculo
    const corpoCalculo = document.getElementById('corpo-calculo');
    if (corpoCalculo) {
        corpoCalculo.innerHTML = '';
    }
    
    // Limpar totais MO, Overhead e Subtotal
    const totalMaoObra = document.getElementById('total-mao-obra');
    const totalOverhead = document.getElementById('total-overhead');
    const subtotalGeral = document.getElementById('subtotal-geral');
    
    if (totalMaoObra) totalMaoObra.innerHTML = 'R$ 0,00';
    if (totalOverhead) totalOverhead.innerHTML = 'R$ 0,00';
    if (subtotalGeral) subtotalGeral.innerHTML = 'R$ 0,00';
    
    // Limpar alertas
    const alertasContainer = document.getElementById('alertas-container');
    if (alertasContainer) {
        alertasContainer.innerHTML = '<div class="alert alert-success">✅ Nenhum alerta identificado</div>';
    }
    
    console.log('✅ Outputs de cálculo limpos');
}

// ========== LIMPAR FORMULÁRIO APÓS SALVAR ==========
function limparFormularioInput() {
    console.log('🧹 Limpando formulário de input completamente...');
    
    // Limpar campos principais
    const clienteInput = document.getElementById('cliente');
    const escopoText = document.getElementById('escopo');
    if (clienteInput) clienteInput.value = '';
    if (escopoText) escopoText.value = '';
    
    // Resetar selects para valores padrão
    const segmentoSelect = document.getElementById('segmento');
    const tipoSelect = document.getElementById('tipo');
    const riscoSelect = document.getElementById('risco');
    const produtoSelect = document.getElementById('produto');
    const complexidadeSelect = document.getElementById('complexidade');
    const urgenciaSelect = document.getElementById('urgencia');
    
    if (segmentoSelect) segmentoSelect.value = 'tecnologia';
    if (tipoSelect) tipoSelect.value = 'novo';
    if (riscoSelect) riscoSelect.value = 'baixo';
    if (produtoSelect) produtoSelect.value = 'contencioso_tributario';
    if (complexidadeSelect) complexidadeSelect.value = 'media';
    if (urgenciaSelect) urgenciaSelect.value = 'normal';
    
    // Resetar condições comerciais
    const entradaInput = document.getElementById('entrada');
    const parcelasInput = document.getElementById('parcelas');
    const descontoInput = document.getElementById('desconto');
    const percParceiroInput = document.getElementById('percParceiro');
    const percCSInput = document.getElementById('percCS');
    const aplicaCSSelect = document.getElementById('aplicaCS');
    const parceiroSelect = document.getElementById('parceiro');
    const riscoEscopoInput = document.getElementById('riscoEscopo');
    
    if (entradaInput) entradaInput.value = '50';
    if (parcelasInput) parcelasInput.value = '1';
    if (descontoInput) descontoInput.value = '0';
    if (percParceiroInput) percParceiroInput.value = '0';
    if (percCSInput) percCSInput.value = '7.5';
    if (aplicaCSSelect) aplicaCSSelect.value = 'sim';
    if (parceiroSelect) parceiroSelect.value = 'nao';
    if (riscoEscopoInput) riscoEscopoInput.value = '20';
    
    // Resetar radio button para "Hora"
    const radioHora = document.querySelector('input[name="cobranca"][value="hora"]');
    if (radioHora) {
        radioHora.checked = true;
        document.querySelectorAll('.radio-option').forEach(o => o.classList.remove('selected'));
        const parentHora = radioHora.closest('.radio-option');
        if (parentHora) parentHora.classList.add('selected');
    }
    
    // Resetar perfis para apenas 1 perfil padrão
    const container = document.getElementById('perfis-container');
    if (container) {
        container.innerHTML = '';
        adicionarPerfil();
    }
    
    // Limpar variáveis de estado
    indiceEditando = -1;
    window.ultimoResultado = null;
    
    // Limpar outputs de cálculo
    limparOutputsCalculo();
    
    console.log('✅ Formulário completamente limpo, modo edição desativado, outputs limpos');
}

// ========== LOGIN ==========
async function verificarSessao() {
    const sessao = localStorage.getItem('mfbd_sessao');
    
    if (!sessao) {
        console.log('🔐 Nenhuma sessão encontrada. Exibindo tela de login.');
        mostrarTelaLogin();
        return false;
    }
    
    console.log('⚠️ Sessão detectada, mas por segurança, solicitando novo login.');
    localStorage.removeItem('mfbd_sessao');
    mostrarTelaLogin();
    return false;
}

function verificarSessaoAposLogin() {
    const sessao = localStorage.getItem('mfbd_sessao');
    if (!sessao) return false;
    
    try {
        const usuario = JSON.parse(sessao);
        if (usuario && usuario.email) {
            usuarioAtual = usuario;
            return true;
        }
    } catch(e) {
        return false;
    }
    return false;
}

function mostrarTelaLogin() {
    const telaLogin = document.getElementById('tela-login');
    const sistema = document.getElementById('sistema-principal');
    
    if (telaLogin) telaLogin.style.display = 'flex';
    if (sistema) sistema.style.display = 'none';
    
    const emailInput = document.getElementById('login-email');
    const senhaInput = document.getElementById('login-senha');
    const loginErro = document.getElementById('login-erro');
    
    if (emailInput) emailInput.value = '';
    if (senhaInput) senhaInput.value = '';
    if (loginErro) loginErro.style.display = 'none';
    
    if (firebaseDatabase && listenerConfigurado) {
        try {
            firebaseDatabase.ref('historico').off();
        } catch(e) {}
        listenerConfigurado = false;
    }
    
    console.log('📱 Tela de login exibida');
}

function mostrarSistema() {
    const telaLogin = document.getElementById('tela-login');
    const sistema = document.getElementById('sistema-principal');
    
    if (telaLogin) telaLogin.style.display = 'none';
    if (sistema) sistema.style.display = 'block';
    
    setTimeout(() => { 
        if (document.querySelectorAll('.perfil-row').length === 0) adicionarPerfil(); 
        atualizarTodosCustos(); 
        atualizarHistorico(); 
        carregarListaUsuarios();
        limparFormularioInput();
    }, 100);
    
    console.log('💻 Sistema principal exibido para:', usuarioAtual?.email);
}

function atualizarHeaderUsuario() {
    if (!usuarioAtual) return;
    const container = document.getElementById('user-info-header');
    if (!container) return;
    let cor = usuarioAtual.perfil === 'Master' ? '#8b5cf6' : usuarioAtual.perfil === 'Admin' ? '#10b981' : '#3b82f6';
    let icone = usuarioAtual.perfil === 'Master' ? '⚡' : usuarioAtual.perfil === 'Admin' ? '👑' : '👤';
    container.innerHTML = `<div style="display:flex;justify-content:flex-end"><span style="background:${cor};padding:8px 20px;border-radius:30px;color:white"><span>${icone} ${usuarioAtual.nome || usuarioAtual.email}</span><button onclick="fazerLogout()" style="background:rgba(255,255,255,0.2);border:none;color:white;padding:5px 10px;border-radius:20px;margin-left:10px;cursor:pointer">🚪 Sair</button></span></div>`;
}

async function fazerLogin(event) {
    event.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const senha = document.getElementById('login-senha').value;
    const btn = document.querySelector('.btn-login');
    const loading = document.getElementById('login-loading');
    const erro = document.getElementById('login-erro');
    
    if (!email || !senha) {
        if (erro) { erro.textContent = '⚠️ Preencha email e senha'; erro.style.display = 'block'; }
        return;
    }
    
    if (btn) btn.innerHTML = '<span class="spinner"></span> Verificando...';
    if (btn) btn.disabled = true;
    if (loading) loading.style.display = 'flex';
    if (erro) erro.style.display = 'none';
    
    try {
        if (typeof firebaseConectado !== 'undefined' && firebaseConectado && firebaseDatabase) {
            const id = email.replace(/[.#$\[\]]/g, '_');
            const snap = await firebaseDatabase.ref('usuarios/' + id).once('value');
            if (snap.exists() && btoa(senha) === snap.val().senhaHash) {
                usuarioAtual = { 
                    email, 
                    nome: snap.val().nome, 
                    perfil: snap.val().perfil,
                    id: id
                };
                
                firebaseDatabase.ref('usuarios/' + id).update({
                    ultimoAcesso: new Date().toISOString(),
                    ultimoAcessoFormatado: new Date().toLocaleString('pt-BR')
                }).catch(e => console.warn('Erro ao atualizar último acesso:', e));
                
                localStorage.setItem('mfbd_sessao', JSON.stringify(usuarioAtual));
                mostrarToast('✅ Login realizado com sucesso!');
                
                setTimeout(() => { 
                    if (loading) loading.style.display = 'none';
                    mostrarSistema(); 
                    atualizarHeaderUsuario(); 
                    carregarTodosDados(); 
                    
                    if (window.location.hash || window.location.search) {
                        window.history.replaceState({}, document.title, window.location.pathname);
                    }
                }, 500);
                return;
            }
        }
        
        if (erro) { erro.textContent = '❌ Email ou senha inválidos'; erro.style.display = 'block'; }
    } catch(e) { 
        console.error('Erro no login:', e);
        if (erro) { erro.textContent = '❌ Erro ao conectar. Tente novamente.'; erro.style.display = 'block'; }
    } finally { 
        if (btn) { btn.innerHTML = '🔐 Entrar no Sistema'; btn.disabled = false; }
        if (loading) loading.style.display = 'none';
    }
}

function toggleSenha() {
    const input = document.getElementById('login-senha');
    const btn = document.querySelector('.toggle-senha');
    if (!input || !btn) return;
    if (input.type === 'password') { 
        input.type = 'text'; 
        btn.textContent = '🙈'; 
    } else { 
        input.type = 'password'; 
        btn.textContent = '👁️'; 
    }
}

function fazerLogout() {
    console.log('🚪 Executando logout...');
    
    if (firebaseDatabase) {
        try {
            firebaseDatabase.ref('historico').off();
            firebaseDatabase.ref('historico').off('child_added');
            firebaseDatabase.ref('historico').off('child_changed');
            firebaseDatabase.ref('historico').off('child_removed');
        } catch(e) { console.warn('Erro ao remover listeners:', e); }
    }
    listenerAtivo = false;
    listenerConfigurado = false;
    
    localStorage.removeItem('mfbd_sessao');
    
    usuarioAtual = null;
    indiceEditando = -1;
    window.ultimoResultado = null;
    historico = [];
    
    cacheFirebase = {
        historico: { dados: null, timestamp: null, ultimoId: null },
        configuracoes: { dados: null, timestamp: null },
        usuarios: { dados: null, timestamp: null }
    };
    
    destruirGraficos();
    
    mostrarTelaLogin();
    mostrarToast('👋 Logout realizado com sucesso!');
    
    if (window.location.hash || window.location.search) {
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// ========== FIREBASE ==========
function testarConexaoFirebase() {
    if (!verificarSessaoAposLogin()) {
        mostrarToast('⚠️ Faça login primeiro!', 'warning');
        return;
    }
    
    const status = document.getElementById('firebase-status');
    if (!status) return;
    if (typeof firebaseConectado === 'undefined' || !firebaseConectado || !firebaseDatabase) {
        status.innerHTML = '❌ Firebase desconectado. Verifique sua conexão.';
        status.style.background = '#fee2e2';
        status.style.color = '#b91c1c';
        mostrarToast('❌ Firebase desconectado', 'error');
        return;
    }
    firebaseDatabase.ref('test').set({ ts: new Date().toISOString() }).then(() => {
        status.innerHTML = '✅ Firebase conectado e funcionando!';
        status.style.background = '#dcfce7';
        status.style.color = '#166534';
        mostrarToast('✅ Firebase conectado com sucesso!');
    }).catch(e => { 
        status.innerHTML = '❌ Erro no Firebase: ' + e.message;
        status.style.background = '#fee2e2';
        status.style.color = '#b91c1c';
        mostrarToast('❌ Erro ao conectar Firebase', 'error');
    });
}

async function carregarTodosDados() {
    if (!verificarSessaoAposLogin()) {
        console.log('⚠️ Tentativa de carregar dados sem autenticação');
        forceLogoutAndRedirect();
        return;
    }
    
    if (typeof firebaseConectado === 'undefined' || !firebaseConectado || !firebaseDatabase) { 
        carregarDadosLocal(); 
        return; 
    }
    
    mostrarToast('🔄 Carregando dados do Firebase...', 'warning');
    
    try {
        const snapshot = await firebaseDatabase.ref('historico').once('value');
        
        if (snapshot.exists()) {
            const historicoObj = snapshot.val();
            historico = Object.entries(historicoObj).map(([id, item]) => ({ 
                ...item, 
                id: id,
                firebaseId: id 
            })).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            localStorage.setItem('historicoSmartPrice', JSON.stringify(historico));
            
            cacheFirebase.historico = {
                dados: historico,
                timestamp: Date.now(),
                ultimoId: Object.keys(historicoObj)[0]
            };
            
            console.log(`✅ Carregados ${historico.length} registros do Firebase`);
        } else {
            carregarDadosLocal();
        }
        
        configurarListenersRealtime();
        
        await carregarConfiguracoesComCache();
        await carregarUsuariosComCache();
        
        atualizarHistorico();
        atualizarDashboardSeAtivo();
        mostrarToast(`✅ ${historico.length} registros carregados! Atualizações em tempo real ativas.`);
        
        const statusDiv = document.getElementById('firebase-status');
        if (statusDiv) {
            statusDiv.innerHTML = `✅ Firebase conectado! ${historico.length} registros (tempo real ativo)`;
            statusDiv.style.background = '#dcfce7';
            statusDiv.style.color = '#166534';
        }
    } catch(e) { 
        console.error('Erro ao carregar dados:', e); 
        carregarDadosLocal(); 
        mostrarToast('❌ Erro ao carregar dados do Firebase', 'error');
    }
}

function configurarListenersRealtime() {
    if (!verificarSessaoAposLogin()) {
        console.log('⚠️ Não configurando listeners - usuário não autenticado');
        return;
    }
    
    if (listenerConfigurado || !firebaseDatabase) return;
    
    console.log('🔌 Configurando listeners em tempo real...');
    listenerConfigurado = true;
    
    firebaseDatabase.ref('historico').on('child_added', (snapshot) => {
        if (!verificarSessaoAposLogin()) return;
        
        const novoRegistro = snapshot.val();
        const id = snapshot.key;
        
        const existe = historico.some(item => item.id === id || item.firebaseId === id);
        
        if (!existe && novoRegistro) {
            console.log('🆕 Novo registro adicionado via real-time:', id);
            const novoItem = { ...novoRegistro, id: id, firebaseId: id };
            historico.unshift(novoItem);
            localStorage.setItem('historicoSmartPrice', JSON.stringify(historico));
            
            cacheFirebase.historico.dados = historico;
            cacheFirebase.historico.timestamp = Date.now();
            
            atualizarHistorico();
            atualizarDashboardSeAtivo();
            mostrarToast(`📊 Nova simulação adicionada: ${novoRegistro.cliente || 'Sem cliente'}`, 'info');
        }
    });
    
    firebaseDatabase.ref('historico').on('child_changed', (snapshot) => {
        if (!verificarSessaoAposLogin()) return;
        
        const registroAtualizado = snapshot.val();
        const id = snapshot.key;
        
        console.log('✏️ Registro atualizado via real-time:', id);
        
        const index = historico.findIndex(item => item.id === id || item.firebaseId === id);
        if (index !== -1) {
            historico[index] = { ...registroAtualizado, id: id, firebaseId: id };
            localStorage.setItem('historicoSmartPrice', JSON.stringify(historico));
            
            cacheFirebase.historico.dados = historico;
            cacheFirebase.historico.timestamp = Date.now();
            
            atualizarHistorico();
            atualizarDashboardSeAtivo();
            mostrarToast(`✏️ Simulação atualizada: ${registroAtualizado.cliente || 'Sem cliente'}`, 'info');
        }
    });
    
    firebaseDatabase.ref('historico').on('child_removed', (snapshot) => {
        if (!verificarSessaoAposLogin()) return;
        
        const id = snapshot.key;
        
        console.log('🗑️ Registro removido via real-time:', id);
        
        const index = historico.findIndex(item => item.id === id || item.firebaseId === id);
        if (index !== -1) {
            historico.splice(index, 1);
            localStorage.setItem('historicoSmartPrice', JSON.stringify(historico));
            
            cacheFirebase.historico.dados = historico;
            cacheFirebase.historico.timestamp = Date.now();
            
            atualizarHistorico();
            atualizarDashboardSeAtivo();
            mostrarToast(`🗑️ Simulação removida`, 'info');
        }
    });
    
    console.log('✅ Listeners em tempo real configurados com sucesso!');
}

function carregarDadosLocal() {
    if (!verificarSessaoAposLogin()) {
        forceLogoutAndRedirect();
        return;
    }
    
    const saved = localStorage.getItem('historicoSmartPrice');
    if (saved) {
        try { 
            historico = JSON.parse(saved); 
            console.log(`✅ Carregados ${historico.length} registros do localStorage`);
        } catch(e) { 
            historico = []; 
        }
    } else {
        historico = [];
    }
    atualizarHistorico();
    atualizarDashboardSeAtivo();
}

async function carregarConfiguracoesComCache() {
    if (!verificarSessaoAposLogin()) return;
    
    const agora = Date.now();
    
    if (cacheFirebase.configuracoes.dados && (agora - cacheFirebase.configuracoes.timestamp) < CACHE_VALIDADE.configuracoes) {
        console.log('📦 Usando cache das configurações');
        aplicarConfiguracoes(cacheFirebase.configuracoes.dados);
        return;
    }
    
    try {
        const cfgSnap = await firebaseDatabase.ref('configuracoes').once('value');
        if (cfgSnap.exists()) {
            const config = cfgSnap.val();
            cacheFirebase.configuracoes = {
                dados: config,
                timestamp: agora
            };
            aplicarConfiguracoes(config);
            console.log('✅ Configurações carregadas do Firebase');
        }
    } catch(e) {
        console.warn('Erro ao carregar configurações:', e);
    }
}

async function carregarUsuariosComCache() {
    if (!verificarSessaoAposLogin()) return;
    
    const agora = Date.now();
    
    if (cacheFirebase.usuarios.dados && (agora - cacheFirebase.usuarios.timestamp) < CACHE_VALIDADE.usuarios) {
        console.log('📦 Usando cache da lista de usuários');
        atualizarListaUsuarios(cacheFirebase.usuarios.dados);
        return;
    }
    
    try {
        const snap = await firebaseDatabase.ref('usuarios').once('value');
        if (snap.exists()) {
            const usuarios = snap.val();
            cacheFirebase.usuarios = {
                dados: usuarios,
                timestamp: agora
            };
            atualizarListaUsuarios(usuarios);
            console.log('✅ Usuários carregados do Firebase');
        }
    } catch(e) {
        console.warn('Erro ao carregar usuários:', e);
    }
}

function aplicarConfiguracoes(cfg) {
    if (!cfg) return;
    
    if (cfg.margens) {
        if (cfg.margens.hora) document.getElementById('margemHora').value = cfg.margens.hora;
        if (cfg.margens.fechado) document.getElementById('margemFechado').value = cfg.margens.fechado;
        if (cfg.margens.retainer) document.getElementById('margemRetainer').value = cfg.margens.retainer;
        if (cfg.margens.exito) document.getElementById('margemExito').value = cfg.margens.exito;
        if (cfg.margens.hibrido) document.getElementById('margemHibrido').value = cfg.margens.hibrido;
    }
    
    if (cfg.impostos) {
        if (cfg.impostos.regime) document.getElementById('regimeTributario').value = cfg.impostos.regime;
        if (cfg.impostos.percentual) document.getElementById('impostos').value = cfg.impostos.percentual;
        if (cfg.impostos.taxaParcelamento) document.getElementById('taxaParcelamento').value = cfg.impostos.taxaParcelamento;
    }
    
    if (cfg.cs) {
        if (cfg.cs.percentual) { 
            document.getElementById('csPadrao').value = cfg.cs.percentual; 
            document.getElementById('percCS').value = cfg.cs.percentual; 
        }
        if (cfg.cs.base) document.getElementById('baseCS').value = cfg.cs.base;
    }
    
    if (cfg.buffers) {
        if (cfg.buffers.baixa) document.getElementById('bufferBaixa').value = cfg.buffers.baixa;
        if (cfg.buffers.media) document.getElementById('bufferMedia').value = cfg.buffers.media;
        if (cfg.buffers.alta) document.getElementById('bufferAlta').value = cfg.buffers.alta;
        if (cfg.buffers.urgente) document.getElementById('bufferUrgencia').value = cfg.buffers.urgente;
    }
    
    if (cfg.overhead) {
        if (cfg.overhead.total) document.getElementById('overheadTotal').value = cfg.overhead.total;
        if (cfg.overhead.horasTotais) document.getElementById('horasTotais').value = cfg.overhead.horasTotais;
    }
    
    if (cfg.salarios) {
        const perfis = ['Estag', 'Jr', 'Pl', 'Sr', 'Coord', 'Socio'];
        perfis.forEach(p => {
            if (cfg.salarios[`salario${p}`]) document.getElementById(`salario${p}`).value = cfg.salarios[`salario${p}`];
            if (cfg.salarios[`beneficios${p}`]) document.getElementById(`beneficios${p}`).value = cfg.salarios[`beneficios${p}`];
        });
    }
    
    atualizarTodosCustos();
}

async function salvarConfiguracoesFirebase() {
    if (!verificarSessaoAposLogin()) {
        mostrarToast('⚠️ Faça login primeiro!', 'warning');
        return;
    }
    
    if (typeof firebaseConectado === 'undefined' || !firebaseConectado || !firebaseDatabase) { 
        mostrarToast('⚠️ Firebase offline. Configurações salvas apenas localmente.', 'warning'); 
        return; 
    }
    
    const cfg = {
        margens: {
            hora: parseFloat(document.getElementById('margemHora')?.value) || 55,
            fechado: parseFloat(document.getElementById('margemFechado')?.value) || 47,
            retainer: parseFloat(document.getElementById('margemRetainer')?.value) || 52,
            exito: parseFloat(document.getElementById('margemExito')?.value) || 65,
            hibrido: parseFloat(document.getElementById('margemHibrido')?.value) || 50
        },
        impostos: {
            regime: document.getElementById('regimeTributario')?.value || 'lucro_presumido',
            percentual: parseFloat(document.getElementById('impostos')?.value) || 11.33,
            taxaParcelamento: parseFloat(document.getElementById('taxaParcelamento')?.value) || 1
        },
        cs: {
            percentual: parseFloat(document.getElementById('csPadrao')?.value) || 7.5,
            base: document.getElementById('baseCS')?.value || 'liquido'
        },
        buffers: {
            baixa: parseFloat(document.getElementById('bufferBaixa')?.value) || 10,
            media: parseFloat(document.getElementById('bufferMedia')?.value) || 20,
            alta: parseFloat(document.getElementById('bufferAlta')?.value) || 30,
            urgente: parseFloat(document.getElementById('bufferUrgencia')?.value) || 20
        },
        overhead: {
            total: parseFloat(document.getElementById('overheadTotal')?.value) || 45000,
            horasTotais: parseFloat(document.getElementById('horasTotais')?.value) || 720
        },
        salarios: {
            salarioEstag: parseFloat(document.getElementById('salarioEstag')?.value) || 1000,
            beneficiosEstag: parseFloat(document.getElementById('beneficiosEstag')?.value) || 400,
            salarioJr: parseFloat(document.getElementById('salarioJr')?.value) || 3500,
            beneficiosJr: parseFloat(document.getElementById('beneficiosJr')?.value) || 600,
            salarioPl: parseFloat(document.getElementById('salarioPl')?.value) || 6500,
            beneficiosPl: parseFloat(document.getElementById('beneficiosPl')?.value) || 800,
            salarioSr: parseFloat(document.getElementById('salarioSr')?.value) || 10000,
            beneficiosSr: parseFloat(document.getElementById('beneficiosSr')?.value) || 1000,
            salarioCoord: parseFloat(document.getElementById('salarioCoord')?.value) || 14000,
            beneficiosCoord: parseFloat(document.getElementById('beneficiosCoord')?.value) || 1200,
            salarioSocio: parseFloat(document.getElementById('salarioSocio')?.value) || 20000,
            beneficiosSocio: parseFloat(document.getElementById('beneficiosSocio')?.value) || 1500
        },
        ultimaAtualizacao: new Date().toISOString(),
        atualizadoPor: usuarioAtual?.email || 'sistema'
    };
    
    try { 
        await firebaseDatabase.ref('configuracoes').set(cfg);
        
        cacheFirebase.configuracoes = {
            dados: cfg,
            timestamp: Date.now()
        };
        
        mostrarToast('✅ Configurações salvas no Firebase com sucesso!'); 
    } catch(e) { 
        console.error('Erro ao salvar configurações:', e);
        mostrarToast('❌ Erro ao salvar configurações: ' + e.message, 'error'); 
    }
}

async function carregarConfiguracoesFirebase() {
    if (!verificarSessaoAposLogin()) {
        mostrarToast('⚠️ Faça login primeiro!', 'warning');
        return;
    }
    
    if (typeof firebaseConectado === 'undefined' || !firebaseConectado || !firebaseDatabase) { 
        mostrarToast('⚠️ Firebase offline. Não foi possível carregar.', 'warning'); 
        return; 
    }
    await carregarConfiguracoesComCache();
    mostrarToast('✅ Configurações carregadas do Firebase com sucesso!');
}

async function backupDadosFirebase() {
    if (!verificarSessaoAposLogin()) {
        mostrarToast('⚠️ Faça login primeiro!', 'warning');
        return;
    }
    
    if (typeof firebaseConectado === 'undefined' || !firebaseConectado || !firebaseDatabase) { 
        mostrarToast('⚠️ Firebase offline. Não foi possível gerar backup.', 'warning'); 
        return; 
    }
    try {
        mostrarToast('🔄 Gerando backup...', 'warning');
        const snap = await firebaseDatabase.ref('/').once('value');
        const backup = JSON.stringify(snap.val(), null, 2);
        const blob = new Blob([backup], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mfbd_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        mostrarToast('✅ Backup gerado com sucesso!');
    } catch(e) { 
        console.error('Erro ao gerar backup:', e);
        mostrarToast('❌ Erro ao gerar backup: ' + e.message, 'error'); 
    }
}

// ========== GERENCIAMENTO DE USUÁRIOS ==========
async function carregarListaUsuarios() {
    if (!verificarSessaoAposLogin()) {
        console.log('⚠️ Tentativa de carregar usuários sem autenticação');
        return;
    }
    
    if (typeof firebaseConectado === 'undefined' || !firebaseConectado || !firebaseDatabase) {
        const container = document.getElementById('lista-usuarios');
        if (container) container.innerHTML = '<div class="info-text">⚠️ Firebase offline. Não é possível carregar usuários.</div>';
        return;
    }
    
    await carregarUsuariosComCache();
}

function atualizarListaUsuarios(usuarios) {
    if (!verificarSessaoAposLogin()) return;
    
    const container = document.getElementById('lista-usuarios');
    if (!container) return;
    
    if (!usuarios || Object.keys(usuarios).length === 0) { 
        container.innerHTML = '<div class="info-text">📭 Nenhum usuário cadastrado</div>'; 
        return; 
    }
    
    let html = `
        <div style="overflow-x:auto">
            <table style="width:100%; border-collapse: collapse;">
                <thead style="background: #f1f5f9;">
                    <tr>
                        <th style="padding: 12px; text-align: left;">Email</th>
                        <th style="padding: 12px; text-align: left;">Nome</th>
                        <th style="padding: 12px; text-align: left;">Perfil</th>
                        <th style="padding: 12px; text-align: left;">Último Acesso</th>
                        <th style="padding: 12px; text-align: left;">Criado em</th>
                        <th style="padding: 12px; text-align: center;">Ações</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    const usuariosArray = Object.entries(usuarios).map(([id, u]) => ({ id, ...u }));
    usuariosArray.sort((a, b) => {
        if (a.perfil === 'Master') return -1;
        if (b.perfil === 'Master') return 1;
        return (b.ultimoAcesso || '').localeCompare(a.ultimoAcesso || '');
    });
    
    usuariosArray.forEach(u => {
        let badgeClass = u.perfil === 'Master' ? 'badge-danger' : u.perfil === 'Admin' ? 'badge-warning' : 'badge-success';
        let podeEditar = usuarioAtual?.perfil === 'Master' || (usuarioAtual?.perfil === 'Admin' && u.perfil !== 'Master');
        let podeExcluir = usuarioAtual?.perfil === 'Master' && u.id !== usuarioAtual?.id && u.perfil !== 'Master';
        
        html += `<tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 12px;">${u.email}</td>
            <td style="padding: 12px;">${u.nome || '-'}</td>
            <td style="padding: 12px;"><span class="badge ${badgeClass}">${u.perfil || 'Usuário'}</span></td>
            <td style="padding: 12px; font-size: 12px; color: #64748b;">
                ${u.ultimoAcessoFormatado || (u.ultimoAcesso ? new Date(u.ultimoAcesso).toLocaleString('pt-BR') : 'Nunca acessou')}
            </td>
            <td style="padding: 12px; font-size: 12px; color: #64748b;">${u.criadoEm ? new Date(u.criadoEm).toLocaleDateString('pt-BR') : '-'}</td>
            <td style="padding: 12px; text-align: center;">
                ${podeEditar ? `<button class="btn-icon" onclick="abrirModalEditarUsuario('${u.id}')" title="Editar" style="background: none; border: none; cursor: pointer; font-size: 18px; margin: 0 5px;">✏️</button>` : ''}
                ${podeExcluir ? `<button class="btn-icon btn-icon-danger" onclick="excluirUsuario('${u.id}', '${u.email.replace(/'/g, "\\'")}')" title="Excluir" style="background: none; border: none; cursor: pointer; font-size: 18px; margin: 0 5px; color: #ef4444;">🗑️</button>` : ''}
            </td>
          </tr>`;
    });
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    container.innerHTML = html;
}

async function adicionarUsuarioFirebase() {
    if (!verificarSessaoAposLogin()) {
        mostrarToast('⚠️ Faça login primeiro!', 'warning');
        return;
    }
    
    if (typeof firebaseConectado === 'undefined' || !firebaseConectado || !firebaseDatabase) { 
        mostrarToast('⚠️ Firebase offline. Não foi possível adicionar usuário.', 'warning'); 
        return; 
    }
    
    const email = document.getElementById('novoUsuarioEmail')?.value?.trim();
    const senha = document.getElementById('novoUsuarioSenha')?.value;
    const nome = document.getElementById('novoUsuarioNome')?.value?.trim();
    const perfil = document.getElementById('novoUsuarioPerfil')?.value;
    
    if (!email || !senha) { 
        mostrarToast('❌ Preencha email e senha', 'error'); 
        return; 
    }
    
    if (senha.length < 4) {
        mostrarToast('❌ A senha deve ter pelo menos 4 caracteres', 'error');
        return;
    }
    
    const id = email.replace(/[.#$\[\]]/g, '_');
    try {
        const existe = await firebaseDatabase.ref('usuarios/' + id).once('value');
        if (existe.exists()) {
            mostrarToast('❌ Este email já está cadastrado!', 'error');
            return;
        }
        
        await firebaseDatabase.ref('usuarios/' + id).set({
            email: email,
            nome: nome || email.split('@')[0],
            perfil: perfil || 'Usuario',
            senhaHash: btoa(senha),
            criadoEm: new Date().toISOString(),
            criadoPor: usuarioAtual?.email || 'sistema',
            ultimoAcesso: null,
            ultimoAcessoFormatado: null
        });
        
        cacheFirebase.usuarios = { dados: null, timestamp: null };
        
        mostrarToast('✅ Usuário adicionado com sucesso!');
        
        if (document.getElementById('novoUsuarioEmail')) document.getElementById('novoUsuarioEmail').value = '';
        if (document.getElementById('novoUsuarioSenha')) document.getElementById('novoUsuarioSenha').value = '';
        if (document.getElementById('novoUsuarioNome')) document.getElementById('novoUsuarioNome').value = '';
        
        fecharModalUsuario();
        await carregarListaUsuarios();
    } catch(e) { 
        console.error('Erro ao adicionar usuário:', e);
        mostrarToast('❌ Erro ao adicionar usuário: ' + e.message, 'error'); 
    }
}

function abrirModalEditarUsuario(userId) {
    if (!verificarSessaoAposLogin()) {
        mostrarToast('⚠️ Faça login primeiro!', 'warning');
        return;
    }
    
    if (typeof firebaseConectado === 'undefined' || !firebaseConectado || !firebaseDatabase) {
        mostrarToast('⚠️ Firebase offline', 'warning');
        return;
    }
    
    firebaseDatabase.ref('usuarios/' + userId).once('value').then(snap => {
        const user = snap.val();
        if (!user) {
            mostrarToast('❌ Usuário não encontrado', 'error');
            return;
        }
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'modalEditarUsuario';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 450px;">
                <div class="modal-header">
                    <h3>✏️ Editar Usuário</h3>
                    <button class="modal-close" onclick="fecharModalUsuario()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" id="editUsuarioEmail" value="${user.email}" readonly style="background:#f1f5f9;">
                    </div>
                    <div class="form-group">
                        <label>Nome</label>
                        <input type="text" id="editUsuarioNome" value="${user.nome || ''}">
                    </div>
                    <div class="form-group">
                        <label>Perfil</label>
                        <select id="editUsuarioPerfil">
                            <option value="Usuario" ${user.perfil === 'Usuario' ? 'selected' : ''}>👤 Usuário</option>
                            <option value="Admin" ${user.perfil === 'Admin' ? 'selected' : ''}>👑 Admin</option>
                            ${usuarioAtual?.perfil === 'Master' ? '<option value="Master" ' + (user.perfil === 'Master' ? 'selected' : '') + '>⚡ Master</option>' : ''}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Nova Senha (deixe em branco para manter)</label>
                        <input type="password" id="editUsuarioSenha" placeholder="••••••">
                    </div>
                    <div class="button-group" style="margin-top: 20px;">
                        <button class="btn btn-primary" onclick="salvarEdicaoUsuario('${userId}')">💾 Salvar</button>
                        <button class="btn btn-secondary" onclick="fecharModalUsuario()">❌ Cancelar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }).catch(e => {
        console.error('Erro ao carregar usuário:', e);
        mostrarToast('❌ Erro ao carregar dados do usuário', 'error');
    });
}

async function salvarEdicaoUsuario(userId) {
    if (!verificarSessaoAposLogin()) {
        mostrarToast('⚠️ Faça login primeiro!', 'warning');
        return;
    }
    
    const nome = document.getElementById('editUsuarioNome')?.value;
    const perfil = document.getElementById('editUsuarioPerfil')?.value;
    const novaSenha = document.getElementById('editUsuarioSenha')?.value;
    
    if (!nome) {
        mostrarToast('❌ Preencha o nome do usuário', 'error');
        return;
    }
    
    try {
        const updates = {
            nome: nome,
            perfil: perfil,
            atualizadoEm: new Date().toISOString(),
            atualizadoPor: usuarioAtual?.email
        };
        
        if (novaSenha && novaSenha.trim() !== '') {
            if (novaSenha.length < 4) {
                mostrarToast('❌ A nova senha deve ter pelo menos 4 caracteres', 'error');
                return;
            }
            updates.senhaHash = btoa(novaSenha);
        }
        
        await firebaseDatabase.ref('usuarios/' + userId).update(updates);
        
        cacheFirebase.usuarios = { dados: null, timestamp: null };
        
        mostrarToast('✅ Usuário atualizado com sucesso!');
        fecharModalUsuario();
        await carregarListaUsuarios();
    } catch(e) {
        console.error('Erro ao salvar edição:', e);
        mostrarToast('❌ Erro ao salvar: ' + e.message, 'error');
    }
}

async function excluirUsuario(userId, userEmail) {
    if (!verificarSessaoAposLogin()) {
        mostrarToast('⚠️ Faça login primeiro!', 'warning');
        return;
    }
    
    if (userId === usuarioAtual?.id) {
        mostrarToast('❌ Você não pode excluir seu próprio usuário!', 'error');
        return;
    }
    
    if (!confirm(`⚠️ TEM CERTEZA que deseja EXCLUIR PERMANENTEMENTE o usuário "${userEmail}"?\n\nEsta ação é irreversível e o usuário perderá todo acesso ao sistema!`)) {
        return;
    }
    
    try {
        const snap = await firebaseDatabase.ref('usuarios/' + userId).once('value');
        const user = snap.val();
        if (user && user.perfil === 'Master') {
            mostrarToast('❌ Usuários Master não podem ser excluídos!', 'error');
            return;
        }
        
        await firebaseDatabase.ref('usuarios/' + userId).remove();
        
        cacheFirebase.usuarios = { dados: null, timestamp: null };
        
        mostrarToast(`✅ Usuário "${userEmail}" excluído com sucesso!`);
        await carregarListaUsuarios();
    } catch(e) {
        console.error('Erro ao excluir usuário:', e);
        mostrarToast('❌ Erro ao excluir: ' + e.message, 'error');
    }
}

function abrirModalNovoUsuario() {
    if (!verificarSessaoAposLogin()) {
        mostrarToast('⚠️ Faça login primeiro!', 'warning');
        return;
    }
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'modalNovoUsuario';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 450px;">
            <div class="modal-header">
                <h3>➕ Novo Usuário</h3>
                <button class="modal-close" onclick="fecharModalUsuario()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>Email *</label>
                    <input type="email" id="novoUsuarioEmail" placeholder="usuario@empresa.com">
                </div>
                <div class="form-group">
                    <label>Senha *</label>
                    <input type="password" id="novoUsuarioSenha" placeholder="•••••• (mínimo 4 caracteres)">
                </div>
                <div class="form-group">
                    <label>Nome</label>
                    <input type="text" id="novoUsuarioNome" placeholder="Nome completo">
                </div>
                <div class="form-group">
                    <label>Perfil</label>
                    <select id="novoUsuarioPerfil">
                        <option value="Usuario">👤 Usuário</option>
                        <option value="Admin">👑 Admin</option>
                        ${usuarioAtual?.perfil === 'Master' ? '<option value="Master">⚡ Master</option>' : ''}
                    </select>
                </div>
                <div class="button-group" style="margin-top: 20px;">
                    <button class="btn btn-primary" onclick="adicionarUsuarioFirebase()">✅ Criar Usuário</button>
                    <button class="btn btn-secondary" onclick="fecharModalUsuario()">❌ Cancelar</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function fecharModalUsuario() {
    const modal1 = document.getElementById('modalNovoUsuario');
    const modal2 = document.getElementById('modalEditarUsuario');
    if (modal1) modal1.remove();
    if (modal2) modal2.remove();
}

// ========== CÁLCULO DE CUSTOS ==========
function getHorasProdutivas(perfil) { 
    return HORAS_PRODUTIVAS[perfil] || 140; 
}

function getCustoHora(perfil) {
    const salario = parseFloat(document.getElementById(`salario${perfil}`)?.value) || 0;
    const beneficios = parseFloat(document.getElementById(`beneficios${perfil}`)?.value) || 0;
    const horas = getHorasProdutivas(perfil);
    const encargos = salario * 0.72;
    const totalMensal = salario + encargos + beneficios;
    const overheadTotal = parseFloat(document.getElementById('overheadTotal')?.value) || 45000;
    const horasTotais = parseFloat(document.getElementById('horasTotais')?.value) || 720;
    const overheadHora = overheadTotal / horasTotais;
    return (totalMensal / horas) + overheadHora;
}

function atualizarTodosCustos() {
    if (!verificarSessaoAposLogin()) return;
    
    const perfis = ['Estag', 'Jr', 'Pl', 'Sr', 'Coord', 'Socio'];
    const overheadTotal = parseFloat(document.getElementById('overheadTotal')?.value) || 45000;
    const horasTotais = parseFloat(document.getElementById('horasTotais')?.value) || 720;
    const overheadHora = overheadTotal / horasTotais;
    
    const overheadSpan = document.getElementById('overheadPorHora');
    if (overheadSpan) overheadSpan.textContent = formatarMoeda(overheadHora);
    
    perfis.forEach(perfil => {
        const salario = parseFloat(document.getElementById(`salario${perfil}`)?.value) || 0;
        const beneficios = parseFloat(document.getElementById(`beneficios${perfil}`)?.value) || 0;
        const horas = getHorasProdutivas(perfil);
        const encargos = salario * 0.72;
        const totalMensal = salario + encargos + beneficios;
        const custoHora = (totalMensal / horas) + overheadHora;
        
        const horasEl = document.getElementById(`horas${perfil}`);
        if (horasEl && !horasEl.readOnly) horasEl.textContent = horas;
        
        const encargosEl = document.getElementById(`encargos${perfil}`);
        if (encargosEl) encargosEl.textContent = Math.round(encargos).toLocaleString('pt-BR');
        
        const totalEl = document.getElementById(`totalMensal${perfil}`);
        if (totalEl) totalEl.textContent = Math.round(totalMensal).toLocaleString('pt-BR');
        
        const custoEl = document.getElementById(`custoHora${perfil}`);
        if (custoEl) custoEl.textContent = custoHora.toFixed(2).replace('.', ',');
    });
}

function calcularBuffer() {
    const comp = document.getElementById('complexidade')?.value || 'media';
    const urg = document.getElementById('urgencia')?.value || 'normal';
    const buffers = {
        baixa: parseFloat(document.getElementById('bufferBaixa')?.value) || 10,
        media: parseFloat(document.getElementById('bufferMedia')?.value) || 20,
        alta: parseFloat(document.getElementById('bufferAlta')?.value) || 30,
        urgente: parseFloat(document.getElementById('bufferUrgencia')?.value) || 20
    };
    let total = buffers[comp] || 20;
    if (urg === 'urgente') total += buffers.urgente;
    return total / 100;
}

function adicionarPerfil() {
    if (indiceEditando !== -1) {
        console.log('🆕 Novo cálculo - limpando modo edição');
        indiceEditando = -1;
        window.ultimoResultado = null;
    }
    
    const container = document.getElementById('perfis-container');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'perfil-row';
    div.innerHTML = `<select class="perfil">
            <option value="estag">Estagiário</option>
            <option value="jr">Júnior</option>
            <option value="pl">Pleno</option>
            <option value="sr">Sênior</option>
            <option value="coord">Coordenador</option>
            <option value="socio">Sócio</option>
        </select>
        <input type="number" class="horas" value="40" min="0" step="1" placeholder="Horas">
        <span class="custo-previsto">R$ 0,00</span>
        <button type="button" class="remove-btn" onclick="removerPerfil(this)">✕</button>`;
    container.appendChild(div);
    atualizarCustoPrevisto(div);
    const horasInput = div.querySelector('.horas');
    const perfilSelect = div.querySelector('.perfil');
    if (horasInput) horasInput.addEventListener('input', () => atualizarCustoPrevisto(div));
    if (perfilSelect) perfilSelect.addEventListener('change', () => atualizarCustoPrevisto(div));
}

function removerPerfil(btn) {
    const perfis = document.querySelectorAll('.perfil-row');
    if (perfis.length > 1) {
        btn.parentElement.remove();
    } else {
        mostrarToast('Mantenha pelo menos um perfil na equipe', 'warning');
    }
}

function atualizarCustoPrevisto(div) {
    const select = div.querySelector('.perfil');
    const horas = parseFloat(div.querySelector('.horas')?.value) || 0;
    if (!select) return;
    const perfilId = select.value.charAt(0).toUpperCase() + select.value.slice(1);
    const custo = getCustoHora(perfilId) * horas;
    const span = div.querySelector('.custo-previsto');
    if (span) span.textContent = formatarMoeda(custo);
}

// ========== CÁLCULO PRINCIPAL ==========
function calcular() {
    if (!verificarSessaoAposLogin()) {
        mostrarToast('⚠️ Faça login primeiro!', 'warning');
        forceLogoutAndRedirect();
        return;
    }
    
    try {
        const perfisContainer = document.getElementById('perfis-container');
        if (!perfisContainer) {
            mostrarToast('❌ Erro: Container de perfis não encontrado', 'error');
            return;
        }
        
        const perfis = [];
        let custoTotalMO = 0;
        document.querySelectorAll('.perfil-row').forEach(row => {
            const select = row.querySelector('.perfil');
            const horasInput = row.querySelector('.horas');
            if (!select || !horasInput) return;
            const horas = parseFloat(horasInput.value) || 0;
            if (horas > 0) {
                const perfilId = select.value.charAt(0).toUpperCase() + select.value.slice(1);
                const custoHora = getCustoHora(perfilId);
                const custo = custoHora * horas;
                custoTotalMO += custo;
                perfis.push({ 
                    perfil: select.options[select.selectedIndex]?.text || perfilId, 
                    horas, 
                    custoHora, 
                    custo 
                });
            }
        });
        
        if (perfis.length === 0) {
            mostrarToast('❌ Adicione pelo menos um perfil com horas', 'warning');
            return;
        }
        
        const bufferPct = calcularBuffer();
        const custoComBuffer = custoTotalMO * (1 + bufferPct);
        const overheadTotal = parseFloat(document.getElementById('overheadTotal')?.value) || 45000;
        
        const percImpostos = parseFloat(document.getElementById('impostos')?.value) || 11.33;
        const impostos = custoComBuffer * (percImpostos / 100);
        
        const aplicaCS = document.getElementById('aplicaCS')?.value === 'sim';
        const percCS = aplicaCS ? (parseFloat(document.getElementById('percCS')?.value) || 7.5) : 0;
        const baseLiquida = custoComBuffer + impostos;
        const cs = aplicaCS ? baseLiquida * (percCS / 100) : 0;
        
        const temParceiro = document.getElementById('parceiro')?.value === 'sim';
        const percParceiro = temParceiro ? (parseFloat(document.getElementById('percParceiro')?.value) || 0) : 0;
        const parceiro = custoComBuffer * (percParceiro / 100);
        
        const custoBase = custoComBuffer + impostos + cs + parceiro;
        
        const tipoCobrancaRadio = document.querySelector('input[name="cobranca"]:checked');
        const tipoCobranca = tipoCobrancaRadio ? tipoCobrancaRadio.value : 'hora';
        const margens = {
            hora: parseFloat(document.getElementById('margemHora')?.value) || 55,
            fechado: parseFloat(document.getElementById('margemFechado')?.value) || 47,
            retainer: parseFloat(document.getElementById('margemRetainer')?.value) || 52,
            exito: parseFloat(document.getElementById('margemExito')?.value) || 65,
            hibrido: parseFloat(document.getElementById('margemHibrido')?.value) || 50
        };
        const margemAlvo = margens[tipoCobranca] / 100;
        
        const precoAlvo = custoBase / (1 - margemAlvo);
        const precoPiso = precoAlvo * 0.85;
        const desconto = parseFloat(document.getElementById('desconto')?.value) || 0;
        
        const urgente = document.getElementById('urgencia')?.value === 'urgente';
        const riscoAlto = document.getElementById('risco')?.value === 'alto';
        const precoPremium = precoAlvo * (1.15 + (urgente ? 0.05 : 0) + (riscoAlto ? 0.1 : 0));
        
        const margemReal = (precoAlvo - custoBase) / precoAlvo;
        const margemPercentual = margemReal * 100;
        
        const entradaPct = parseFloat(document.getElementById('entrada')?.value) || 50;
        const parcelas = parseInt(document.getElementById('parcelas')?.value) || 1;
        const taxaJuros = parseFloat(document.getElementById('taxaParcelamento')?.value) || 1;
        const valorEntrada = precoAlvo * (entradaPct/100);
        const valorParcelas = (precoAlvo - valorEntrada) / parcelas;
        const valorTotalJuros = precoAlvo * Math.pow(1 + taxaJuros/100, parcelas);
        
        const alertas = [];
        
        if (precoAlvo * (1 - desconto/100) < precoPiso) alertas.push({ tipo: 'critical', msg: '⚠️ Abaixo do piso - não vender!' });
        if (desconto > 15) alertas.push({ tipo: 'warning', msg: '⚠️ Desconto acima da alçada (máx 15%)' });
        if (margemPercentual < 30) alertas.push({ tipo: 'critical', msg: '⚠️ Margem abaixo do mínimo aceitável (<30%)' });
        if (tipoCobranca === 'exito' && custoBase > precoAlvo * 0.4) alertas.push({ tipo: 'critical', msg: '⚠️ Modelo de êxito sem cobertura de custo' });
        if (tipoCobranca === 'exito' && entradaPct < 30) alertas.push({ tipo: 'warning', msg: '⚠️ Êxito: recomendado entrada mínima de 30%' });
        if (tipoCobranca === 'retainer' && !document.getElementById('escopo')?.value) alertas.push({ tipo: 'warning', msg: '⚠️ Retainer sem escopo definido' });
        if (riscoAlto && tipoCobranca === 'exito') alertas.push({ tipo: 'critical', msg: '⚠️ Risco alto + modelo êxito = combinação crítica!' });
        if (parcelas > 12) alertas.push({ tipo: 'warning', msg: `⚠️ Parcelamento longo (${parcelas}x): risco elevado` });
        if (riscoAlto) alertas.push({ tipo: 'critical', msg: '⚠️ Cliente com alto risco de inadimplência' });
        if (document.getElementById('tipo')?.value === 'recorrente' && desconto === 0) alertas.push({ tipo: 'info', msg: '💡 Cliente recorrente: considere oferecer 5-10% de desconto' });
        
        let idParaSalvar;
        let timestampParaSalvar;
        let dataParaSalvar;
        
        if (indiceEditando !== -1 && historico[indiceEditando]) {
            idParaSalvar = historico[indiceEditando].id || historico[indiceEditando].firebaseId;
            timestampParaSalvar = historico[indiceEditando].timestamp;
            dataParaSalvar = historico[indiceEditando].data;
            console.log('📝 Modo edição - Mantendo ID:', idParaSalvar);
        } else {
            idParaSalvar = 'SP_' + new Date().getTime() + '_' + Math.random().toString(36).substr(2, 6);
            timestampParaSalvar = new Date().toISOString();
            dataParaSalvar = new Date().toLocaleString('pt-BR');
            console.log('🆕 Modo novo - Criando ID:', idParaSalvar);
        }
        
        document.getElementById('preco-piso').innerHTML = formatarMoeda(precoPiso);
        document.getElementById('preco-alvo').innerHTML = formatarMoeda(precoAlvo);
        document.getElementById('preco-premium').innerHTML = formatarMoeda(precoPremium);
        
        document.getElementById('output-custo').innerHTML = formatarMoeda(custoBase);
        document.getElementById('output-impostos').innerHTML = formatarMoeda(impostos);
        document.getElementById('output-cs').innerHTML = formatarMoeda(cs);
        document.getElementById('output-margem-valor').innerHTML = formatarMoeda(precoAlvo - custoBase);
        document.getElementById('output-margem-pct').innerHTML = formatarPercentual(margemReal);
        
        document.getElementById('output-entrada').innerHTML = formatarMoeda(valorEntrada);
        document.getElementById('output-parcelas').innerHTML = `${parcelas}x ${formatarMoeda(valorParcelas)}`;
        document.getElementById('output-total-juros').innerHTML = formatarMoeda(valorTotalJuros);
        
        document.getElementById('composicao-custo').innerHTML = formatarMoeda(custoTotalMO + overheadTotal);
        document.getElementById('composicao-buffer').innerHTML = formatarMoeda(custoTotalMO * bufferPct);
        document.getElementById('composicao-impostos').innerHTML = formatarMoeda(impostos);
        document.getElementById('composicao-cs').innerHTML = formatarMoeda(cs);
        document.getElementById('composicao-parceiro').innerHTML = formatarMoeda(parceiro);
        document.getElementById('composicao-base').innerHTML = formatarMoeda(custoBase);
        document.getElementById('composicao-margem').innerHTML = formatarMoeda(precoAlvo - custoBase);
        
        const corpoCalculo = document.getElementById('corpo-calculo');
        if (corpoCalculo) {
            corpoCalculo.innerHTML = '';
            perfis.forEach(p => {
                corpoCalculo.innerHTML += `<tr>
                    <td>${p.perfil}</td>
                    <td>${p.horas}h</td>
                    <td>${formatarMoeda(p.custoHora)}</td>
                    <td>${formatarMoeda(p.custo)}</td>
                    <td>${formatarMoeda(p.custo * bufferPct)}</td>
                    <td>${formatarMoeda(p.custo * (1 + bufferPct))}</td>
                </tr>`;
            });
        }
        document.getElementById('total-mao-obra').innerHTML = formatarMoeda(custoTotalMO);
        document.getElementById('total-overhead').innerHTML = formatarMoeda(overheadTotal);
        document.getElementById('subtotal-geral').innerHTML = formatarMoeda(custoTotalMO + overheadTotal);
        
        const alertContainer = document.getElementById('alertas-container');
        if (alertContainer) {
            alertContainer.innerHTML = '';
            if (alertas.length === 0) alertContainer.innerHTML = '<div class="alert alert-success">✅ Nenhum alerta identificado</div>';
            else alertas.forEach(a => alertContainer.innerHTML += `<div class="alert alert-${a.tipo === 'critical' ? 'critical' : a.tipo === 'warning' ? 'warning' : 'info'}">${a.msg}</div>`);
        }
        
        window.ultimoResultado = {
            id: idParaSalvar,
            timestamp: timestampParaSalvar,
            data: dataParaSalvar,
            cliente: document.getElementById('cliente')?.value || '',
            segmento: document.getElementById('segmento')?.value || '',
            tipo: document.getElementById('tipo')?.value || '',
            risco: document.getElementById('risco')?.value || '',
            produto: document.getElementById('produto')?.value || '',
            produtoTexto: document.getElementById('produto')?.options[document.getElementById('produto')?.selectedIndex]?.text || '',
            escopo: document.getElementById('escopo')?.value || '',
            complexidade: document.getElementById('complexidade')?.value || '',
            urgencia: document.getElementById('urgencia')?.value || '',
            cobranca: tipoCobranca,
            cobrancaTexto: tipoCobrancaRadio?.nextSibling?.nodeValue?.trim() || tipoCobranca,
            entrada: entradaPct,
            parcelas: parcelas,
            desconto: desconto,
            percParceiro: percParceiro,
            percCS: percCS,
            aplicaCS: document.getElementById('aplicaCS')?.value || 'sim',
            parceiro: document.getElementById('parceiro')?.value || 'nao',
            riscoEscopo: parseFloat(document.getElementById('riscoEscopo')?.value) || 20,
            preco: precoAlvo,
            precoPiso: precoPiso,
            precoPremium: precoPremium,
            margem: margemPercentual.toFixed(1),
            margemValor: precoAlvo - custoBase,
            custoBase: custoBase,
            impostosCalculados: impostos,
            csCalculado: cs,
            parceiroValor: parceiro,
            bufferPct: bufferPct * 100,
            detalhamentoCalculo: perfis,
            alertas: alertas.map(a => a.msg).join('; '),
            usuario: usuarioAtual?.email || 'desconhecido',
            usuarioNome: usuarioAtual?.nome || 'Usuário'
        };
        
        showTab('output');
        mostrarToast('✅ Cálculo realizado com sucesso!');
        
    } catch(e) { 
        console.error('Erro no cálculo:', e); 
        mostrarToast('❌ Erro no cálculo: ' + e.message, 'error'); 
    }
}

// ========== SALVAR HISTÓRICO ==========
async function salvarHistorico() {
    if (!verificarSessaoAposLogin()) {
        mostrarToast('⚠️ Faça login primeiro!', 'warning');
        forceLogoutAndRedirect();
        return;
    }
    
    if (!window.ultimoResultado) { 
        mostrarToast('❌ Calcule um preço primeiro!', 'warning'); 
        return; 
    }
    
    const btn = document.querySelector('#output .btn-success');
    const original = btn?.innerHTML;
    if (btn) { 
        btn.innerHTML = '<span class="spinner"></span> Salvando...'; 
        btn.disabled = true; 
    }
    
    try {
        const isEditando = (indiceEditando !== -1);
        const idExistente = isEditando && historico[indiceEditando] ? (historico[indiceEditando].id || historico[indiceEditando].firebaseId) : null;
        
        if (isEditando && idExistente) {
            window.ultimoResultado.id = idExistente;
            window.ultimoResultado.timestamp = historico[indiceEditando].timestamp;
            window.ultimoResultado.data = historico[indiceEditando].data;
            console.log('✏️ Atualizando registro existente - ID:', idExistente);
        }
        
        if (typeof firebaseConectado !== 'undefined' && firebaseConectado && firebaseDatabase) {
            await firebaseDatabase.ref('historico/' + window.ultimoResultado.id).set(window.ultimoResultado);
            console.log('✅ Salvo no Firebase com ID:', window.ultimoResultado.id);
        }
        
        if (isEditando && idExistente) {
            const index = historico.findIndex(item => (item.id === idExistente) || (item.firebaseId === idExistente));
            if (index !== -1) {
                historico[index] = { ...window.ultimoResultado, firebaseId: window.ultimoResultado.id };
                console.log('✏️ Registro atualizado no índice:', index);
            } else {
                historico.unshift({ ...window.ultimoResultado, firebaseId: window.ultimoResultado.id });
                console.log('⚠️ ID não encontrado, adicionado ao início');
            }
        } else {
            const existe = historico.some(item => (item.id === window.ultimoResultado.id) || (item.firebaseId === window.ultimoResultado.id));
            if (!existe) {
                historico.unshift({ ...window.ultimoResultado, firebaseId: window.ultimoResultado.id });
                console.log('🆕 Novo registro adicionado');
            } else {
                const index = historico.findIndex(item => (item.id === window.ultimoResultado.id) || (item.firebaseId === window.ultimoResultado.id));
                if (index !== -1) historico[index] = { ...window.ultimoResultado, firebaseId: window.ultimoResultado.id };
                else historico.unshift({ ...window.ultimoResultado, firebaseId: window.ultimoResultado.id });
            }
        }
        
        localStorage.setItem('historicoSmartPrice', JSON.stringify(historico));
        
        cacheFirebase.historico.dados = historico;
        cacheFirebase.historico.timestamp = Date.now();
        
        const acao = isEditando ? 'atualizada' : 'salva';
        mostrarToast(`✅ Simulação ${acao} com sucesso!`, 'success');
        
        // LIMPAR COMPLETAMENTE O FORMULÁRIO E OUTPUTS APÓS SALVAR
        limparFormularioInput();
        
        atualizarHistorico();
        atualizarDashboardSeAtivo();
        
        window.ultimoResultado = null;
        indiceEditando = -1;
        
        // Após salvar, mostrar o histórico
        showTab('historico');
        
    } catch(e) { 
        console.error('Erro ao salvar:', e);
        mostrarToast('❌ Erro ao salvar: ' + e.message, 'error'); 
    } finally { 
        if (btn) { 
            btn.innerHTML = original; 
            btn.disabled = false; 
        } 
    }
}

async function excluirItemFirebase(id, idx) {
    if (!verificarSessaoAposLogin()) {
        mostrarToast('⚠️ Faça login primeiro!', 'warning');
        return;
    }
    
    if (!confirm(`🗑️ Excluir permanentemente esta simulação?`)) return;
    try {
        if (typeof firebaseConectado !== 'undefined' && firebaseConectado && firebaseDatabase) {
            await firebaseDatabase.ref('historico/' + id).remove();
            console.log('✅ Excluído do Firebase:', id);
        }
        
        historico.splice(idx, 1);
        localStorage.setItem('historicoSmartPrice', JSON.stringify(historico));
        
        cacheFirebase.historico.dados = historico;
        cacheFirebase.historico.timestamp = Date.now();
        
        atualizarHistorico();
        atualizarDashboardSeAtivo();
        fecharModal();
        mostrarToast('✅ Simulação excluída com sucesso!');
    } catch(e) { 
        console.error('Erro ao excluir:', e);
        mostrarToast('❌ Erro ao excluir: ' + e.message, 'error'); 
    }
}

// ========== EDIÇÃO DE ITEM ==========
function editarItem(idx) {
    if (!verificarSessaoAposLogin()) {
        mostrarToast('⚠️ Faça login primeiro!', 'warning');
        return;
    }
    
    const item = historico[idx];
    if (!item) return;
    
    const idOriginal = item.id || item.firebaseId;
    indiceEditando = idx;
    
    console.log('✏️ Editando item:', { id: idOriginal, cliente: item.cliente, indice: idx });
    mostrarToast(`✏️ Editando: ${item.cliente}`, 'warning');
    
    const clienteInput = document.getElementById('cliente');
    const segmentoSelect = document.getElementById('segmento');
    const tipoSelect = document.getElementById('tipo');
    const riscoSelect = document.getElementById('risco');
    const produtoSelect = document.getElementById('produto');
    const escopoText = document.getElementById('escopo');
    const complexidadeSelect = document.getElementById('complexidade');
    const urgenciaSelect = document.getElementById('urgencia');
    const entradaInput = document.getElementById('entrada');
    const parcelasInput = document.getElementById('parcelas');
    const descontoInput = document.getElementById('desconto');
    const percParceiroInput = document.getElementById('percParceiro');
    const percCSInput = document.getElementById('percCS');
    const aplicaCSSelect = document.getElementById('aplicaCS');
    const parceiroSelect = document.getElementById('parceiro');
    const riscoEscopoInput = document.getElementById('riscoEscopo');
    
    if (clienteInput) clienteInput.value = item.cliente || '';
    if (segmentoSelect) segmentoSelect.value = item.segmento || 'tecnologia';
    if (tipoSelect) tipoSelect.value = item.tipo || 'novo';
    if (riscoSelect) riscoSelect.value = item.risco || 'baixo';
    if (produtoSelect) produtoSelect.value = item.produto || 'consultoria';
    if (escopoText) escopoText.value = item.escopo || '';
    if (complexidadeSelect) complexidadeSelect.value = item.complexidade || 'media';
    if (urgenciaSelect) urgenciaSelect.value = item.urgencia || 'normal';
    if (entradaInput) entradaInput.value = item.entrada || 50;
    if (parcelasInput) parcelasInput.value = item.parcelas || 1;
    if (descontoInput) descontoInput.value = item.desconto || 0;
    if (percParceiroInput) percParceiroInput.value = item.percParceiro || 0;
    if (percCSInput) percCSInput.value = item.percCS || 7.5;
    if (aplicaCSSelect) aplicaCSSelect.value = item.aplicaCS || 'sim';
    if (parceiroSelect) parceiroSelect.value = item.parceiro || 'nao';
    if (riscoEscopoInput) riscoEscopoInput.value = item.riscoEscopo || 20;
    
    const radios = document.getElementsByName('cobranca');
    radios.forEach(radio => {
        if (radio.value === item.cobranca) {
            radio.checked = true;
            const parent = radio.closest('.radio-option');
            if (parent) {
                document.querySelectorAll('.radio-option').forEach(o => o.classList.remove('selected'));
                parent.classList.add('selected');
            }
        }
    });
    
    const container = document.getElementById('perfis-container');
    if (container) {
        container.innerHTML = '';
        if (item.detalhamentoCalculo && item.detalhamentoCalculo.length > 0) {
            const perfilMap = { 
                'Estagiário': 'estag', 
                'Júnior': 'jr', 
                'Pleno': 'pl', 
                'Sênior': 'sr', 
                'Coordenador': 'coord', 
                'Sócio': 'socio' 
            };
            item.detalhamentoCalculo.forEach(p => {
                const div = document.createElement('div');
                div.className = 'perfil-row';
                div.innerHTML = `<select class="perfil">
                        <option value="estag">Estagiário</option>
                        <option value="jr">Júnior</option>
                        <option value="pl">Pleno</option>
                        <option value="sr">Sênior</option>
                        <option value="coord">Coordenador</option>
                        <option value="socio">Sócio</option>
                    </select>
                    <input type="number" class="horas" value="${p.horas}" min="0" step="1" placeholder="Horas">
                    <span class="custo-previsto">${formatarMoeda(p.custo)}</span>
                    <button type="button" class="remove-btn" onclick="removerPerfil(this)">✕</button>`;
                container.appendChild(div);
                const perfilSelect = div.querySelector('.perfil');
                if (perfilSelect) perfilSelect.value = perfilMap[p.perfil] || 'pl';
                const horasInput = div.querySelector('.horas');
                if (horasInput) horasInput.addEventListener('input', () => atualizarCustoPrevisto(div));
                if (perfilSelect) perfilSelect.addEventListener('change', () => atualizarCustoPrevisto(div));
                atualizarCustoPrevisto(div);
            });
        } else {
            adicionarPerfil();
        }
    }
    
    fecharModal();
    showTab('input');
}

// ========== HISTÓRICO ==========
function atualizarHistorico() {
    if (!verificarSessaoAposLogin()) return;
    
    carregarPreferenciasPaginacao();
    configurarPaginacao();
    atualizarHistoricoComPaginacao();
}

function configurarPaginacao() {
    const lista = document.getElementById('historico-lista');
    if (!lista) return;
    const card = document.querySelector('#historico .card');
    if (!card) return;
    
    if (!document.getElementById('itensPorPagina')) {
        const controle = document.createElement('div');
        controle.className = 'itens-por-pagina';
        controle.innerHTML = `<label>Itens por página:</label><select id="itensPorPagina" onchange="mudarItensPorPagina(this.value)"><option value="5">5</option><option value="10" selected>10</option><option value="20">20</option><option value="50">50</option></select>`;
        card.insertBefore(controle, lista);
    }
    if (!document.getElementById('paginacao-container')) {
        const div = document.createElement('div');
        div.id = 'paginacao-container';
        div.className = 'paginacao';
        lista.parentNode.insertBefore(div, lista.nextSibling);
    }
}

function mudarItensPorPagina(valor) { 
    itensPorPagina = parseInt(valor); 
    paginaAtual = 1; 
    salvarPreferenciasPaginacao(); 
    atualizarHistoricoComPaginacao(); 
}

function salvarPreferenciasPaginacao() { 
    localStorage.setItem('mfbd_itens_por_pagina', itensPorPagina); 
}

function carregarPreferenciasPaginacao() { 
    itensPorPagina = parseInt(localStorage.getItem('mfbd_itens_por_pagina')) || 10; 
}

function atualizarHistoricoComPaginacao() {
    if (!verificarSessaoAposLogin()) return;
    
    const lista = document.getElementById('historico-lista');
    if (!lista) return;
    
    if (!historico.length) { 
        lista.innerHTML = '<p class="text-center" style="padding:40px">📭 Nenhuma simulação encontrada</p>'; 
        const totalSpan = document.getElementById('total-simulacoes');
        if (totalSpan) totalSpan.textContent = '0';
        const pagContainer = document.getElementById('paginacao-container');
        if (pagContainer) pagContainer.innerHTML = '';
        return; 
    }
    
    const filtro = document.getElementById('filtroCliente')?.value?.toLowerCase() || '';
    const ordenar = document.getElementById('ordenarPor')?.value || 'data';
    let filtrados = historico.filter(i => i.cliente?.toLowerCase().includes(filtro));
    
    if (ordenar === 'data') filtrados.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    else if (ordenar === 'cliente') filtrados.sort((a,b) => (a.cliente || '').localeCompare(b.cliente || ''));
    else if (ordenar === 'preco') filtrados.sort((a,b) => (b.preco || 0) - (a.preco || 0));
    else if (ordenar === 'margem') filtrados.sort((a,b) => parseFloat(b.margem || 0) - parseFloat(a.margem || 0));
    
    historicoPaginado = filtrados;
    const total = filtrados.length;
    const totalPag = Math.ceil(total / itensPorPagina);
    if (paginaAtual > totalPag) paginaAtual = totalPag || 1;
    const inicio = (paginaAtual - 1) * itensPorPagina;
    const itensPagina = filtrados.slice(inicio, inicio + itensPorPagina);
    
    renderizarListaHistorico(itensPagina);
    renderizarPaginacao(total, totalPag, inicio);
    
    const totalSpan = document.getElementById('total-simulacoes');
    if (totalSpan) totalSpan.textContent = total;
}

function renderizarListaHistorico(itens) {
    if (!verificarSessaoAposLogin()) return;
    
    const lista = document.getElementById('historico-lista');
    if (!lista) return;
    lista.innerHTML = '';
    
    itens.forEach(item => {
        const idx = historico.findIndex(h => (h.id === item.id) || (h.firebaseId === item.id) || (h.firebaseId === item.firebaseId));
        if (idx === -1) return;
        const riscoClass = item.risco === 'alto' ? 'badge-danger' : item.risco === 'medio' ? 'badge-warning' : 'badge-success';
        lista.innerHTML += `<div class="historico-item" onclick="abrirModalEdicao(${idx})">
            <div class="historico-header">
                <span class="historico-titulo">
                    ${item.cliente || 'Sem nome'}
                    <span style="font-size:10px; color:#64748b; margin-left:8px;">ID: ${(item.id || item.firebaseId || 'N/A').substring(0, 12)}...</span>
                </span>
                <div class="historico-acoes" onclick="event.stopPropagation()">
                    <button onclick="editarItem(${idx})" title="Editar">✏️</button>
                    <button onclick="excluirItem(${idx})" title="Excluir">🗑️</button>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px">
                <div><small>Produto</small><br><strong>${item.produtoTexto || item.produto || '-'}</strong></div>
                <div><small>Preço</small><br><strong>${formatarMoeda(item.preco)}</strong></div>
                <div><small>Margem</small><br><strong>${item.margem || 0}%</strong></div>
                <div><small>Risco</small><br><span class="badge ${riscoClass}">${item.risco || '-'}</span></div>
            </div>
            <div style="font-size:11px;color:#64748b;margin-top:8px">
                📅 ${item.data || ''}
                ${item.usuario ? ` 👤 ${item.usuario}` : ''}
            </div>
        </div>`;
    });
}

function renderizarPaginacao(total, totalPag, inicio) {
    const container = document.getElementById('paginacao-container');
    if (!container || total <= itensPorPagina) { 
        if(container) container.innerHTML = ''; 
        return; 
    }
    let html = `<div class="paginacao-info">Mostrando ${inicio+1}-${Math.min(inicio+itensPorPagina, total)} de ${total} resultados</div>`;
    html += `<div class="paginacao-controles">`;
    html += `<button class="paginacao-btn" onclick="irParaPagina(1)" ${paginaAtual===1?'disabled':''}>⏮️ Primeira</button>`;
    html += `<button class="paginacao-btn" onclick="irParaPagina(${paginaAtual-1})" ${paginaAtual===1?'disabled':''}>◀️ Anterior</button>`;
    
    for(let i=Math.max(1, paginaAtual-2); i<=Math.min(totalPag, paginaAtual+2); i++)
        html += `<button class="paginacao-btn ${i===paginaAtual?'active':''}" onclick="irParaPagina(${i})">${i}</button>`;
    
    html += `<button class="paginacao-btn" onclick="irParaPagina(${paginaAtual+1})" ${paginaAtual===totalPag?'disabled':''}>Próxima ▶️</button>`;
    html += `<button class="paginacao-btn" onclick="irParaPagina(${totalPag})" ${paginaAtual===totalPag?'disabled':''}>Última ⏭️</button>`;
    html += `</div>`;
    container.innerHTML = html;
}

function irParaPagina(pag) {
    pag = parseInt(pag);
    if (isNaN(pag)) return;
    const total = Math.ceil(historicoPaginado.length / itensPorPagina);
    if (pag < 1 || pag > total) return;
    paginaAtual = pag;
    atualizarHistoricoComPaginacao();
}

function abrirModalEdicao(idx) {
    if (!verificarSessaoAposLogin()) {
        mostrarToast('⚠️ Faça login primeiro!', 'warning');
        return;
    }
    
    const item = historico[idx];
    if (!item) return;
    const modalContent = document.getElementById('modal-conteudo');
    if (!modalContent) return;
    modalContent.innerHTML = `
        <p><strong>ID:</strong> <code style="background:#f1f5f9;padding:4px 8px;border-radius:8px">${(item.id || item.firebaseId || 'N/A').substring(0, 16)}...</code></p>
        <p><strong>Cliente:</strong> ${item.cliente || '-'}</p>
        <p><strong>Produto:</strong> ${item.produtoTexto || item.produto || '-'}</p>
        <p><strong>Modelo:</strong> ${item.cobrancaTexto || item.cobranca || '-'}</p>
        <p><strong>Preço:</strong> ${formatarMoeda(item.preco)}</p>
        <p><strong>Margem:</strong> ${item.margem || 0}%</p>
        <p><strong>Risco:</strong> ${item.risco || '-'}</p>
        <p><strong>Data:</strong> ${item.data || '-'}</p>
        <p><strong>Usuário:</strong> ${item.usuarioNome || item.usuario || '-'}</p>
        <div class="button-group" style="margin-top:20px">
            <button class="btn btn-warning" onclick="editarItem(${idx})">✏️ Editar</button>
            <button class="btn btn-danger" onclick="excluirItem(${idx})">🗑️ Excluir</button>
            <button class="btn btn-secondary" onclick="fecharModal()">Fechar</button>
        </div>`;
    const modal = document.getElementById('modalEdicao');
    if (modal) modal.classList.add('active');
}

function excluirItem(idx) { 
    const idParaExcluir = historico[idx]?.id || historico[idx]?.firebaseId;
    if (idParaExcluir) {
        excluirItemFirebase(idParaExcluir, idx);
    } else {
        mostrarToast('❌ Erro: ID não encontrado para exclusão', 'error');
    }
}

function fecharModal() { 
    const modal = document.getElementById('modalEdicao');
    if (modal) modal.classList.remove('active');
}

// ========== EXPORTAÇÃO ==========
function exportarExcel() {
    if (!verificarSessaoAposLogin()) {
        mostrarToast('⚠️ Faça login primeiro!', 'warning');
        return;
    }
    
    if (!historico.length) { 
        mostrarToast('📭 Nenhum dado para exportar', 'warning'); 
        return; 
    }
    
    const modalChoice = document.createElement('div');
    modalChoice.className = 'modal';
    modalChoice.id = 'modalExportChoice';
    modalChoice.style.display = 'flex';
    modalChoice.innerHTML = `
        <div class="modal-content" style="max-width:400px">
            <div class="modal-header">
                <h3>📊 Exportar Excel</h3>
                <button class="modal-close" onclick="document.getElementById('modalExportChoice').remove()">&times;</button>
            </div>
            <div class="modal-body">
                <p style="margin-bottom:20px">O que deseja exportar?</p>
                <div style="display:flex;flex-direction:column;gap:12px">
                    <button class="btn btn-primary" onclick="exportarExcelOpcao('pagina')">📄 Apenas página atual (${historicoPaginado.length} registros)</button>
                    <button class="btn btn-success" onclick="exportarExcelOpcao('todos')">📚 Todos os registros (${historico.length} registros)</button>
                    <button class="btn btn-secondary" onclick="document.getElementById('modalExportChoice').remove()">❌ Cancelar</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modalChoice);
}

function exportarExcelOpcao(tipo) {
    document.getElementById('modalExportChoice')?.remove();
    
    let dadosParaExportar, nomeArquivo;
    if (tipo === 'pagina') {
        dadosParaExportar = historicoPaginado;
        nomeArquivo = `historico_pagina_${paginaAtual}_${new Date().toISOString().split('T')[0]}.csv`;
    } else {
        dadosParaExportar = historico;
        nomeArquivo = `historico_completo_${new Date().toISOString().split('T')[0]}.csv`;
    }
    
    const cabecalhos = ['ID', 'Data', 'Cliente', 'Produto', 'Preço (R$)', 'Margem (%)', 'Risco', 'Complexidade', 'Cobrança', 'Usuário'];
    const dados = dadosParaExportar.map(item => [
        (item.id || item.firebaseId || ''), 
        item.data || '', 
        item.cliente || '', 
        item.produtoTexto || item.produto || '', 
        (parseFloat(item.preco) || 0).toLocaleString('pt-BR', {minimumFractionDigits:2}).replace('.', ','), 
        (parseFloat(item.margem) || 0).toFixed(1).replace('.', ','), 
        item.risco || '', 
        item.complexidade || '', 
        item.cobrancaTexto || item.cobranca || '',
        item.usuarioNome || item.usuario || ''
    ]);
    
    const conteudoCSV = [cabecalhos, ...dados].map(linha => linha.join(';')).join('\n');
    const blob = new Blob(["\uFEFF" + conteudoCSV], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = nomeArquivo;
    link.click();
    mostrarToast(`📊 ${tipo === 'pagina' ? 'Página' : 'Histórico completo'} exportado com sucesso!`, 'success');
}

function exportarPDF() {
    if (!verificarSessaoAposLogin()) {
        mostrarToast('⚠️ Faça login primeiro!', 'warning');
        return;
    }
    
    if (!historico.length) { 
        mostrarToast('📭 Nenhum dado para exportar', 'warning'); 
        return; 
    }
    
    const modalChoice = document.createElement('div');
    modalChoice.className = 'modal';
    modalChoice.id = 'modalExportPDFChoice';
    modalChoice.style.display = 'flex';
    modalChoice.innerHTML = `
        <div class="modal-content" style="max-width:400px">
            <div class="modal-header">
                <h3>📑 Exportar PDF</h3>
                <button class="modal-close" onclick="document.getElementById('modalExportPDFChoice').remove()">&times;</button>
            </div>
            <div class="modal-body">
                <p style="margin-bottom:20px">O que deseja exportar?</p>
                <div style="display:flex;flex-direction:column;gap:12px">
                    <button class="btn btn-primary" onclick="exportarPDFOpcao('pagina')">📄 Apenas página atual (${historicoPaginado.length} registros)</button>
                    <button class="btn btn-success" onclick="exportarPDFOpcao('todos')">📚 Todos os registros (${historico.length} registros)</button>
                    <button class="btn btn-secondary" onclick="document.getElementById('modalExportPDFChoice').remove()">❌ Cancelar</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modalChoice);
}

function exportarPDFOpcao(tipo) {
    document.getElementById('modalExportPDFChoice')?.remove();
    
    let dadosParaExportar, tituloArquivo, subtitulo;
    if (tipo === 'pagina') {
        dadosParaExportar = historicoPaginado;
        tituloArquivo = `historico_pagina_${paginaAtual}_${new Date().toISOString().split('T')[0]}.html`;
        subtitulo = `Página ${paginaAtual} de ${Math.ceil(historico.length / itensPorPagina)} - ${dadosParaExportar.length} registros`;
    } else {
        dadosParaExportar = historico;
        tituloArquivo = `historico_completo_${new Date().toISOString().split('T')[0]}.html`;
        subtitulo = `Histórico Completo - ${dadosParaExportar.length} registros`;
    }
    
    let conteudoHTML = `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>MFBD - Histórico de Simulações</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { color: #1e293b; text-align: center; }
            h2 { color: #334155; text-align: center; font-size: 16px; font-weight: normal; margin-bottom: 20px; }
            table { border-collapse: collapse; width: 100%; margin-top: 20px; }
            th { background: #1e293b; color: white; padding: 12px; text-align: left; }
            td { border: 1px solid #e2e8f0; padding: 10px; }
            .header-info { margin-bottom: 20px; color: #64748b; }
            .footer { margin-top: 30px; text-align: center; color: #94a3b8; font-size: 12px; }
        </style>
    </head>
    <body>
        <h1>MFBD - Precificação Inteligente</h1>
        <h2>${subtitulo}</h2>
        <div class="header-info">
            <p>📅 Exportado em: ${new Date().toLocaleString('pt-BR')}</p>
            <p>📊 Total de simulações: ${dadosParaExportar.length}</p>
        </div>
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Data</th>
                    <th>Cliente</th>
                    <th>Produto</th>
                    <th>Preço</th>
                    <th>Margem</th>
                    <th>Risco</th>
                </tr>
            </thead>
            <tbody>`;
    
    dadosParaExportar.forEach(item => {
        conteudoHTML += `<tr>
            <td>${(item.id || item.firebaseId || '-').substring(0, 16)}...</td>
            <td>${item.data || '-'}</td>
            <td>${item.cliente || '-'}</td>
            <td>${item.produtoTexto || item.produto || '-'}</td>
            <td>${formatarMoeda(item.preco)}</td>
            <td>${item.margem || 0}%</td>
            <td>${item.risco || '-'}</td>
        </tr>`;
    });
    
    conteudoHTML += `</tbody>
    </table>
        <div class="footer">
            MFBD - Sistema de Precificação Inteligente | Gerado em ${new Date().toLocaleString('pt-BR')}
        </div>
    </body>
    </html>`;
    
    const blob = new Blob([conteudoHTML], { type: 'text/html;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = tituloArquivo;
    link.click();
    mostrarToast(`📑 ${tipo === 'pagina' ? 'Página' : 'Histórico completo'} exportado!`, 'success');
    
    if (confirm('Abrir para impressão?')) {
        const janela = window.open('', '_blank');
        janela.document.write(conteudoHTML);
        janela.document.close();
        janela.print();
    }
}

// ========== DASHBOARD ==========
function showTab(tab) {
    const tabs = document.querySelectorAll('.tab');
    const contents = document.querySelectorAll('.tab-content');
    tabs.forEach(t => t.classList.remove('active'));
    contents.forEach(c => c.classList.remove('active'));
    const activeTab = document.querySelector(`[onclick="showTab('${tab}')"]`);
    if (activeTab) activeTab.classList.add('active');
    const activeContent = document.getElementById(tab);
    if (activeContent) activeContent.classList.add('active');
    if (tab === 'historico') setTimeout(() => atualizarHistorico(), 100);
    if (tab === 'dashboard') setTimeout(() => inicializarGraficos(), 100);
}

function inicializarGraficos() { 
    if (!verificarSessaoAposLogin()) return;
    destruirGraficos(); 
    atualizarTodosGraficos(); 
}

function destruirGraficos() {
    if (graficoPrecos) { graficoPrecos.destroy(); graficoPrecos = null; }
    if (graficoSegmentos) { graficoSegmentos.destroy(); graficoSegmentos = null; }
    if (graficoMargens) { graficoMargens.destroy(); graficoMargens = null; }
    if (graficoRisco) { graficoRisco.destroy(); graficoRisco = null; }
    if (graficoTopClientes) { graficoTopClientes.destroy(); graficoTopClientes = null; }
    if (graficoTendenciaMargens) { graficoTendenciaMargens.destroy(); graficoTendenciaMargens = null; }
}

function mudarPeriodoGraficos(p, e) {
    if (!verificarSessaoAposLogin()) return;
    
    periodoAtualGraficos = p;
    document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
    if(e?.target) e.target.classList.add('active');
    
    const periodoTexto = { '7d': 'Últimos 7 dias', '30d': 'Últimos 30 dias', '90d': 'Últimos 90 dias', 'all': 'Todo período' };
    const periodoPrecoEl = document.getElementById('periodo-preco');
    const periodoMargemEl = document.getElementById('periodo-margem');
    if (periodoPrecoEl) periodoPrecoEl.textContent = periodoTexto[p];
    if (periodoMargemEl) periodoMargemEl.textContent = periodoTexto[p];
    
    atualizarTodosGraficos();
}

function filtrarPorPeriodo(items, periodo) {
    if (periodo === 'all' || !items?.length) return items;
    const limite = new Date();
    if (periodo === '7d') limite.setDate(limite.getDate() - 7);
    else if (periodo === '30d') limite.setDate(limite.getDate() - 30);
    else if (periodo === '90d') limite.setDate(limite.getDate() - 90);
    else return items;
    return items.filter(i => new Date(i.timestamp) >= limite);
}

function atualizarDashboardSeAtivo() {
    if (!verificarSessaoAposLogin()) return;
    
    const dashboard = document.getElementById('dashboard');
    if (dashboard && dashboard.classList.contains('active')) {
        destruirGraficos();
        atualizarTodosGraficos();
    }
}

function atualizarTodosGraficos() {
    if (!verificarSessaoAposLogin()) return;
    
    if (!historico.length) {
        mostrarGraficosVazios();
        return;
    }
    
    const filtrados = filtrarPorPeriodo(historico, periodoAtualGraficos);
    
    const kpiTotal = document.getElementById('kpi-total-simulacoes');
    const kpiTicket = document.getElementById('kpi-ticket-medio');
    const kpiMargem = document.getElementById('kpi-margem-media');
    const kpiRisco = document.getElementById('kpi-risco-alto');
    
    if (kpiTotal) kpiTotal.textContent = filtrados.length;
    let somaPrecos = 0, somaMargens = 0;
    filtrados.forEach(i => { 
        somaPrecos += parseFloat(i.preco) || 0; 
        somaMargens += parseFloat(i.margem) || 0; 
    });
    if (kpiTicket) kpiTicket.textContent = formatarMoeda(somaPrecos / (filtrados.length || 1));
    if (kpiMargem) kpiMargem.textContent = (somaMargens / (filtrados.length || 1)).toFixed(1) + '%';
    if (kpiRisco) kpiRisco.textContent = filtrados.filter(i => i.risco === 'alto').length;
    
    criarGraficoPrecos(filtrados);
    criarGraficoSegmentos();
    criarGraficoMargens();
    criarGraficoRisco();
    criarGraficoTopClientes();
    criarGraficoTendenciaMargens(filtrados);
}

function mostrarGraficosVazios() {
    destruirGraficos();
    const kpiTotal = document.getElementById('kpi-total-simulacoes');
    const kpiTicket = document.getElementById('kpi-ticket-medio');
    const kpiMargem = document.getElementById('kpi-margem-media');
    const kpiRisco = document.getElementById('kpi-risco-alto');
    if (kpiTotal) kpiTotal.textContent = '0';
    if (kpiTicket) kpiTicket.textContent = 'R$ 0,00';
    if (kpiMargem) kpiMargem.textContent = '0%';
    if (kpiRisco) kpiRisco.textContent = '0';
}

function criarGraficoPrecos(dados) {
    const canvas = document.getElementById('graficoPrecos');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (dados.length === 0) {
        if (graficoPrecos) graficoPrecos.destroy();
        graficoPrecos = null;
        return;
    }
    
    const ordenados = [...dados].sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
    const labels = ordenados.map(i => i.data?.split(' ')[0] || '');
    const precos = ordenados.map(i => parseFloat(i.preco) || 0);
    
    if (graficoPrecos) graficoPrecos.destroy();
    graficoPrecos = new Chart(ctx, {
        type: 'line',
        data: { 
            labels: labels, 
            datasets: [{ 
                label: 'Preço (R$)', 
                data: precos, 
                borderColor: '#3b82f6', 
                backgroundColor: 'rgba(59,130,246,0.1)',
                borderWidth: 3,
                pointRadius: 4,
                fill: true 
            }] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return 'R$ ' + context.parsed.y.toLocaleString('pt-BR', {minimumFractionDigits: 2});
                        }
                    }
                }
            }
        }
    });
}

function criarGraficoSegmentos() {
    const canvas = document.getElementById('graficoSegmentos');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const segmentos = {};
    historico.forEach(i => {
        const seg = i.segmento || 'outros';
        segmentos[seg] = (segmentos[seg] || 0) + 1;
    });
    
    const nomes = { 
        tecnologia: 'Tecnologia', varejo: 'Varejo', industria: 'Indústria', 
        servicos: 'Serviços', saude: 'Saúde', educacao: 'Educação',
        financeiro: 'Financeiro', consultoria: 'Consultoria', 
        marketing: 'Marketing', outros: 'Outros' 
    };
    
    const labels = Object.keys(segmentos).map(s => nomes[s] || s);
    const valores = Object.values(segmentos);
    const cores = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#ec4899','#14b8a6','#f97316','#6366f1','#64748b'];
    
    const legendaContainer = document.getElementById('legenda-segmentos');
    if (legendaContainer) {
        legendaContainer.innerHTML = labels.map((l,i) => `
            <div class="legenda-item">
                <span class="legenda-cor" style="background:${cores[i%cores.length]}"></span>
                <span>${l}: ${valores[i]}</span>
            </div>
        `).join('');
    }
    
    if (graficoSegmentos) graficoSegmentos.destroy();
    graficoSegmentos = new Chart(ctx, { 
        type: 'doughnut', 
        data: { 
            labels: labels, 
            datasets: [{ 
                data: valores, 
                backgroundColor: cores.slice(0,labels.length),
                borderWidth: 2,
                borderColor: 'white'
            }] 
        }, 
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            cutout: '65%'
        } 
    });
}

function criarGraficoMargens() {
    const canvas = document.getElementById('graficoMargens');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const margensPorTipo = {};
    historico.forEach(i => { 
        const tipo = i.cobrancaTexto || i.cobranca || 'outros'; 
        const margem = parseFloat(i.margem) || 0; 
        if (!margensPorTipo[tipo]) margensPorTipo[tipo] = { soma: 0, count: 0 }; 
        margensPorTipo[tipo].soma += margem; 
        margensPorTipo[tipo].count++; 
    });
    
    const labels = Object.keys(margensPorTipo);
    const valores = labels.map(t => (margensPorTipo[t].soma / margensPorTipo[t].count).toFixed(1));
    
    if (graficoMargens) graficoMargens.destroy();
    graficoMargens = new Chart(ctx, { 
        type: 'bar', 
        data: { 
            labels: labels, 
            datasets: [{ 
                label: 'Margem Média (%)', 
                data: valores, 
                backgroundColor: '#8b5cf6',
                borderRadius: 8
            }] 
        }, 
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { callback: (v) => v + '%' } } }
        } 
    });
}

function criarGraficoRisco() {
    const canvas = document.getElementById('graficoRisco');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const riscos = { 
        baixo: historico.filter(i => i.risco === 'baixo').length, 
        medio: historico.filter(i => i.risco === 'medio').length, 
        alto: historico.filter(i => i.risco === 'alto').length 
    };
    const cores = { baixo: '#10b981', medio: '#f59e0b', alto: '#ef4444' };
    
    const legendaContainer = document.getElementById('legenda-risco');
    if (legendaContainer) {
        legendaContainer.innerHTML = Object.keys(riscos).map(r => `
            <div class="legenda-item">
                <span class="legenda-cor" style="background:${cores[r]}"></span>
                <span>${r.charAt(0).toUpperCase()+r.slice(1)}: ${riscos[r]}</span>
            </div>
        `).join('');
    }
    
    if (graficoRisco) graficoRisco.destroy();
    graficoRisco = new Chart(ctx, { 
        type: 'pie', 
        data: { 
            labels: ['Baixo Risco', 'Médio Risco', 'Alto Risco'], 
            datasets: [{ 
                data: [riscos.baixo, riscos.medio, riscos.alto], 
                backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                borderWidth: 2,
                borderColor: 'white'
            }] 
        }, 
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        } 
    });
}

function criarGraficoTopClientes() {
    const canvas = document.getElementById('graficoTopClientes');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const clientes = {};
    historico.forEach(i => { 
        const cliente = i.cliente || 'Não informado'; 
        clientes[cliente] = (clientes[cliente] || 0) + (parseFloat(i.preco) || 0); 
    });
    const topClientes = Object.entries(clientes).sort((a,b) => b[1] - a[1]).slice(0,5);
    
    if (graficoTopClientes) graficoTopClientes.destroy();
    graficoTopClientes = new Chart(ctx, { 
        type: 'bar', 
        data: { 
            labels: topClientes.map(c => c[0].length > 20 ? c[0].substring(0,20)+'...' : c[0]), 
            datasets: [{ 
                label: 'Total (R$)', 
                data: topClientes.map(c => c[1]), 
                backgroundColor: '#10b981',
                borderRadius: 8
            }] 
        }, 
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            indexAxis: 'y',
            plugins: { legend: { display: false } }
        } 
    });
}

function criarGraficoTendenciaMargens(dados) {
    const canvas = document.getElementById('graficoTendenciaMargens');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (dados.length === 0) {
        if (graficoTendenciaMargens) graficoTendenciaMargens.destroy();
        graficoTendenciaMargens = null;
        return;
    }
    
    const ordenados = [...dados].sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
    const labels = ordenados.map(i => i.data?.split(' ')[0] || '');
    const margens = ordenados.map(i => parseFloat(i.margem) || 0);
    
    const mediaMovel = [];
    for (let i = 0; i < margens.length; i++) {
        if (i < 2) mediaMovel.push(null);
        else mediaMovel.push(Number(((margens[i] + margens[i-1] + margens[i-2]) / 3).toFixed(1)));
    }
    
    if (graficoTendenciaMargens) graficoTendenciaMargens.destroy();
    graficoTendenciaMargens = new Chart(ctx, { 
        type: 'line', 
        data: { 
            labels: labels, 
            datasets: [
                { 
                    label: 'Margem (%)', 
                    data: margens, 
                    borderColor: '#f59e0b', 
                    backgroundColor: 'rgba(245,158,11,0.1)',
                    borderWidth: 2, 
                    pointRadius: 3, 
                    tension: 0.3 
                },
                { 
                    label: 'Tendência', 
                    data: mediaMovel, 
                    borderColor: '#3b82f6', 
                    borderWidth: 3, 
                    borderDash: [5,5], 
                    pointRadius: 0, 
                    fill: false 
                }
            ] 
        }, 
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, ticks: { callback: (v) => v + '%' } } }
        } 
    });
}

// ========== INICIALIZAÇÃO ==========
window.onload = function() {
    console.log('🚀 MFBD 8.6 - Versão com Limpeza Total');
    console.log('📅 Data/Hora:', new Date().toLocaleString('pt-BR'));
    
    // FORÇAR LOGOUT AO CARREGAR/ATUALIZAR A PÁGINA
    logoutAoAtualizarPagina();
    
    const statusDiv = document.getElementById('firebase-status');
    if (statusDiv) {
        if (typeof firebaseConectado !== 'undefined' && firebaseConectado && firebaseDatabase) {
            statusDiv.innerHTML = '✅ Firebase conectado';
            statusDiv.style.background = '#dcfce7';
            statusDiv.style.color = '#166534';
        } else {
            statusDiv.innerHTML = '⚠️ Firebase offline - usando localStorage.';
            statusDiv.style.background = '#fef3c7';
            statusDiv.style.color = '#92400e';
        }
    }
    
    setTimeout(() => { 
        if (document.querySelectorAll('.perfil-row').length === 0 && verificarSessaoAposLogin()) {
            adicionarPerfil();
        }
    }, 200);
    
    document.querySelectorAll('.radio-option').forEach(opt => {
        opt.addEventListener('click', function() {
            const radio = this.querySelector('input');
            if (radio) { 
                radio.checked = true; 
                document.querySelectorAll('.radio-option').forEach(o => o.classList.remove('selected')); 
                this.classList.add('selected'); 
            }
        });
    });
    
    const perfis = ['Estag', 'Jr', 'Pl', 'Sr', 'Coord', 'Socio'];
    perfis.forEach(p => {
        const salario = document.getElementById(`salario${p}`);
        const beneficios = document.getElementById(`beneficios${p}`);
        if (salario) salario.addEventListener('input', atualizarTodosCustos);
        if (beneficios) beneficios.addEventListener('input', atualizarTodosCustos);
    });
    
    const overheadTotal = document.getElementById('overheadTotal');
    const horasTotais = document.getElementById('horasTotais');
    if (overheadTotal) overheadTotal.addEventListener('input', atualizarTodosCustos);
    if (horasTotais) horasTotais.addEventListener('input', atualizarTodosCustos);
    
    const filtroCliente = document.getElementById('filtroCliente');
    const ordenarPor = document.getElementById('ordenarPor');
    if (filtroCliente) filtroCliente.addEventListener('input', () => { paginaAtual = 1; atualizarHistoricoComPaginacao(); });
    if (ordenarPor) ordenarPor.addEventListener('change', () => { paginaAtual = 1; atualizarHistoricoComPaginacao(); });
    
    window.addEventListener('click', (event) => {
        const modal = document.getElementById('modalEdicao');
        if (event.target === modal) fecharModal();
    });
    
    atualizarTodosCustos();
    atualizarHistorico();
    
    console.log('✅ Sistema MFBD 8.6 inicializado com sucesso!');
    console.log('🎯 Limpeza total após salvar/editar ativa!');
};

// Adicionar animação de saída para toasts
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @keyframes slideOutRight {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(styleSheet);
