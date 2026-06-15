exports.handler = async function(event) {
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  return {
    statusCode: 200,
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      ok: true,
      hasApiKey: hasKey,
      msg: hasKey ? "Chave API configurada." : "FALTA: adiciona ANTHROPIC_API_KEY nas variáveis de ambiente do Netlify."
    })
  };
};
