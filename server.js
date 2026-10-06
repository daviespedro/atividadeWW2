const express = require('express');

const apiProducao = express();
const PORTA_SERVIDOR = process.env.PORT || 8080;

apiProducao.use(express.json());

// Base de dados simulada em memória
let bancoOrdens = [];

/* ==========================================================================
   FUNÇÕES DE APOIO E REGRAS DE NEGÓCIO
   ========================================================================== */

// Ajuste do custo unitário baseado no tipo de produto
const obterCustoAjustado = (tipo, custoBase) => {
  let percentualAumento = 0;

  switch (Number(tipo)) {
    case 1:
      percentualAumento = 0;
      break;
    case 2:
      percentualAumento = 0.10; // +10%
      break;
    case 3:
      percentualAumento = 0.20; // +20%
      break;
    default:
      return null;
  }

  return custoBase * (1 + percentualAumento);
};

// Determina o nível do alerta de estoque
const definirStatusAlerta = (estoqueFinal) => {
  if (estoqueFinal > 5000) return "ALTO";
  if (estoqueFinal < 500) return "CRITICO";
  return "NORMAL";
};

// Processa e calcula todos os campos derivados da ordem
const processarRegrasOrdem = (dadosOrdem) => {
  const qtd = Number(dadosOrdem.quantidadeProduzida);
  const custoBase = Number(dadosOrdem.custoUnitarioBase);
  const estInicial = Number(dadosOrdem.estoqueInicial);

  const custoUnitarioAjustado = obterCustoAjustado(dadosOrdem.tipoProduto, custoBase);
  const estoqueFinal = estInicial + qtd;
  const alertaEstoque = definirStatusAlerta(estoqueFinal);
  const custoTotal = qtd * custoUnitarioAjustado;

  return {
    codigoOrdem: String(dadosOrdem.codigoOrdem),
    codigoProduto: String(dadosOrdem.codigoProduto),
    tipoProduto: Number(dadosOrdem.tipoProduto),
    quantidadeProduzida: qtd,
    custoUnitarioBase: custoBase,
    estoqueInicial: estInicial,
    custoUnitarioAjustado,
    estoqueFinal,
    custoTotal,
    alertaEstoque
  };
};

/* ==========================================================================
   ENDPOINTS REST ( /ordens )
   ========================================================================== */

// 1. POST /ordens - Cadastrar nova ordem
apiProducao.post('/ordens', (requisicao, resposta) => {
  const {
    codigoOrdem,
    codigoProduto,
    tipoProduto,
    quantidadeProduzida,
    custoUnitarioBase,
    estoqueInicial
  } = requisicao.body;

  // Validação de presença dos campos
  if (
    codigoOrdem === undefined ||
    codigoProduto === undefined ||
    tipoProduto === undefined ||
    quantidadeProduzida === undefined ||
    custoUnitarioBase === undefined ||
    estoqueInicial === undefined
  ) {
    return resposta.status(400).json({
      mensagemErro: "Todos os campos obrigatórios devem ser preenchidos."
    });
  }

  // Validação de unicidade do código da ordem
  const jaExiste = bancoOrdens.some(item => String(item.codigoOrdem) === String(codigoOrdem));
  if (jaExiste) {
    return resposta.status(400).json({
      mensagemErro: `Já existe uma ordem cadastrada com o código ${codigoOrdem}.`
    });
  }

  // Validação do tipoProduto (Lógica com loop)
  const tiposPermitidos = [1, 2, 3];
  let eValido = false;
  let idx = 0;
  while (idx < tiposPermitidos.length) {
    if (tiposPermitidos[idx] === Number(tipoProduto)) {
      eValido = true;
      break;
    }
    idx++;
  }

  if (!eValido) {
    return resposta.status(400).json({
      mensagemErro: "O campo tipoProduto deve conter o valor 1 (Padrão), 2 (Premium) ou 3 (Sob encomenda)."
    });
  }

  // Criação da ordem recalculada
  const ordemProcessada = processarRegrasOrdem(requisicao.body);
  bancoOrdens.push(ordemProcessada);

  return resposta.status(201).json(ordemProcessada);
});

// 2. GET /ordens - Listar ordens com filtros opcionais
apiProducao.get('/ordens', (requisicao, resposta) => {
  let consulta = [...bancoOrdens];
  const { tipo, alerta } = requisicao.query;

  if (tipo) {
    consulta = consulta.filter(o => o.tipoProduto === Number(tipo));
  }

  if (alerta) {
    consulta = consulta.filter(o => o.alertaEstoque.toLowerCase() === String(alerta).toLowerCase());
  }

  return resposta.status(200).json(consulta);
});

// 3. GET /ordens/:codigoOrdem - Consultar ordem específica
apiProducao.get('/ordens/:codigoOrdem', (requisicao, resposta) => {
  const { codigoOrdem } = requisicao.params;
  const localizacao = bancoOrdens.find(o => o.codigoOrdem === String(codigoOrdem));

  if (!localizacao) {
    return resposta.status(404).json({
      mensagemErro: "Ordem de produção não encontrada na base de dados."
    });
  }

  return resposta.status(200).json(localizacao);
});

// 4. PUT /ordens/:codigoOrdem - Atualizar ordem existente
apiProducao.put('/ordens/:codigoOrdem', (requisicao, resposta) => {
  const { codigoOrdem } = requisicao.params;
  const posicao = bancoOrdens.findIndex(o => o.codigoOrdem === String(codigoOrdem));

  if (posicao === -1) {
    return resposta.status(404).json({
      mensagemErro: "Não foi possível atualizar: Ordem inexistente."
    });
  }

  const { tipoProduto } = requisicao.body;

  if (tipoProduto !== undefined) {
    const tiposValidos = [1, 2, 3];
    let atendeTipo = false;
    for (let t of tiposValidos) {
      if (t === Number(tipoProduto)) {
        atendeTipo = true;
        break;
      }
    }
    if (!atendeTipo) {
      return resposta.status(400).json({
        mensagemErro: "O campo tipoProduto deve ser 1, 2 ou 3."
      });
    }
  }

  const registroAtual = bancoOrdens[posicao];
  const dadosUnificados = {
    ...registroAtual,
    ...requisicao.body,
    codigoOrdem: registroAtual.codigoOrdem // Impede alteração da chave primária
  };

  const registroAtualizado = processarRegrasOrdem(dadosUnificados);
  bancoOrdens[posicao] = registroAtualizado;

  return resposta.status(200).json(registroAtualizado);
});

// 5. DELETE /ordens/:codigoOrdem - Remover ordem
apiProducao.delete('/ordens/:codigoOrdem', (requisicao, resposta) => {
  const { codigoOrdem } = requisicao.params;
  const posicao = bancoOrdens.findIndex(o => o.codigoOrdem === String(codigoOrdem));

  if (posicao === -1) {
    return resposta.status(404).json({
      mensagemErro: "Falha ao remover: Ordem de produção não localizada."
    });
  }

  bancoOrdens.splice(posicao, 1);

  return resposta.status(200).json({
    sucesso: true,
    mensagem: `Ordem '${codigoOrdem}' eliminada com sucesso.`
  });
});

/* ==========================================================================
   ENDPOINT DE RELATÓRIO CONSOLIDADO
   ========================================================================== */

// 6. GET /relatorios/ordens - Relatório geral
apiProducao.get('/relatorios/ordens', (requisicao, resposta) => {
  const totalOrdens = bancoOrdens.length;

  if (totalOrdens === 0) {
    return resposta.status(200).json({
      totalOrdens: 0,
      estoquePorTipo: { padrao: 0, premium: 0, sobEncomenda: 0 },
      mediaCustoTotalPorOrdem: 0,
      ordemMaisCara: null,
      ordemMaisBarata: null,
      quantidadeAlertas: { alto: 0, critico: 0, normal: 0 },
      porProduto: {}
    });
  }

  let estoquePadrao = 0;
  let estoquePremium = 0;
  let estoqueSobEncomenda = 0;
  let acumuladorCusto = 0;

  let ordemMaisCara = bancoOrdens[0];
  let ordemMaisBarata = bancoOrdens[0];

  let contagemAlertas = { alto: 0, critico: 0, normal: 0 };
  const agrupadoPorProduto = {};

  bancoOrdens.forEach((item) => {
    // 1. Estoque final acumulado por tipo
    if (item.tipoProduto === 1) estoquePadrao += item.estoqueFinal;
    else if (item.tipoProduto === 2) estoquePremium += item.estoqueFinal;
    else if (item.tipoProduto === 3) estoqueSobEncomenda += item.estoqueFinal;

    // 2. Acúmulo do custo total
    acumuladorCusto += item.custoTotal;

    // 3. Comparativos de custo extremo
    if (item.custoTotal > ordemMaisCara.custoTotal) ordemMaisCara = item;
    if (item.custoTotal < ordemMaisBarata.custoTotal) ordemMaisBarata = item;

    // 4. Mapeamento de Alertas
    if (item.alertaEstoque === "ALTO") contagemAlertas.alto++;
    else if (item.alertaEstoque === "CRITICO") contagemAlertas.critico++;
    else if (item.alertaEstoque === "NORMAL") contagemAlertas.normal++;

    // 5. Consolidação agrupada por codigoProduto
    const prodKey = item.codigoProduto;
    if (!agrupadoPorProduto[prodKey]) {
      agrupadoPorProduto[prodKey] = {
        estoqueFinalConsolidado: 0,
        valorTotalInvestido: 0
      };
    }
    agrupadoPorProduto[prodKey].estoqueFinalConsolidado += item.estoqueFinal;
    agrupadoPorProduto[prodKey].valorTotalInvestido += item.custoTotal;
  });

  return resposta.status(200).json({
    totalOrdens,
    estoquePorTipo: {
      padrao: estoquePadrao,
      premium: estoquePremium,
      sobEncomenda: estoqueSobEncomenda
    },
    mediaCustoTotalPorOrdem: acumuladorCusto / totalOrdens,
    ordemMaisCara: {
      codigoOrdem: ordemMaisCara.codigoOrdem,
      custoTotal: ordemMaisCara.custoTotal
    },
    ordemMaisBarata: {
      codigoOrdem: ordemMaisBarata.codigoOrdem,
      custoTotal: ordemMaisBarata.custoTotal
    },
    quantidadeAlertas: contagemAlertas,
    porProduto: agrupadoPorProduto
  });
});

/* ==========================================================================
   INICIALIZAÇÃO DO SERVIDOR
   ========================================================================== */
apiProducao.listen(PORTA_SERVIDOR, () => {
  console.log(`[Servidor de Produção] Ativo em http://localhost:${PORTA_SERVIDOR}`);
});