const https = require("https");

exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let nome;
  try {
    nome = JSON.parse(event.body).nome;
    if (!nome) throw new Error("Nome em falta");
  } catch(e) {
    return { statusCode: 400, body: "Pedido inválido: " + e.message };
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) {
    return { statusCode: 500, body: "Chave API não configurada. Adiciona ANTHROPIC_API_KEY nas variáveis de ambiente do Netlify." };
  }

  const prompt =
    `Analisa o ingrediente alimentar: "${nome}"\n\n` +
    `Responde APENAS com JSON puro, sem markdown:\n` +
    `{"grupo_nova":"1","alergenios":[],"vestigios":[],"nutrientes_100g":{"kcal":0,"carb":0,"acucares":0,"gorduras":0,"saturadas":0,"proteinas":0,"sal":0,"fibra":0},"nome_pt":"${nome}"}\n\n` +
    `grupo_nova: "1"=não processado(frutas/vegetais frescos,carne fresca,ovos,leguminosas), ` +
    `"2"=minimamente processado(congelados simples,leite pasteurizado,farinhas,arroz,azeite,sal), ` +
    `"3"=processado(queijo,pão,conservas,fumados,enlatados,vinho,enchidos), ` +
    `"4"=ultra-processado(refrigerantes,nuggets,bolachas industriais,salsichas).\n` +
    `alergenios e vestigios: IDs dos 14 UE: gluten,crustaceos,ovos,peixe,amendoins,soja,leite,frutos_c,aipo,mostarda,sesamo,sulfitos,tremocos,moluscos.\n` +
    `nutrientes_100g: valores médios por 100g. Números com ponto decimal.`;

  const payload = JSON.stringify({
    model: "claude-sonnet-4-6",
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }]
  });

  try {
    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Length": Buffer.byteLength(payload)
        }
      };
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", chunk => { data += chunk; });
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      });
      req.on("error", reject);
      req.write(payload);
      req.end();
    });

    if (result.status !== 200) {
      return { statusCode: 502, body: "Erro API Anthropic: " + result.body };
    }

    const apiData = JSON.parse(result.body);
    const txt = apiData.content?.[0]?.text || "";
    const clean = txt.replace(/```[\w]*\n?/g, "").trim();
    const parsed = JSON.parse(clean);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed)
    };
  } catch(e) {
    return { statusCode: 500, body: "Erro: " + e.message };
  }
};
