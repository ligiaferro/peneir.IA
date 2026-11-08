import type { Metadata } from "next";
import Link from "next/link";
import { ContactLine, LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Política de Privacidade | peneir.IA",
  description: "Como a peneir.IA trata dados pessoais, nos termos da LGPD (Lei 13.709/2018).",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de Privacidade" updatedAt="7 de novembro de 2026">
      <p>
        Esta política explica quais dados pessoais a peneir.IA trata, para quê,
        com quem compartilha e como você exerce seus direitos, conforme a Lei
        Geral de Proteção de Dados (LGPD — Lei 13.709/2018).
      </p>

      <h2>1. Dados que tratamos</h2>
      <ul>
        <li>
          <strong>Conta:</strong> nome ou razão social, e-mail, senha (guardada
          de forma criptografada pelo provedor de autenticação) e tipo de
          perfil.
        </li>
        <li>
          <strong>Perfil de busca:</strong> descrição de produtos e serviços,
          palavras-chave, categorias, estados de atuação e preferência de
          alertas. A partir desse texto geramos uma representação numérica
          (vetor) usada para encontrar oportunidades compatíveis.
        </li>
        <li>
          <strong>Documentos:</strong> os PDFs que você envia (por exemplo,
          certidões e contratos sociais), seus metadados (tipo, validade) e os
          vínculos com oportunidades.
        </li>
        <li>
          <strong>Análises:</strong> os resultados das análises por IA que você
          solicitar.
        </li>
        <li>
          <strong>Registros técnicos:</strong> dados de acesso e de envio de
          e-mails, necessários para segurança e funcionamento do serviço.
        </li>
      </ul>
      <p>
        Os editais e licitações exibidos são dados públicos do Portal Nacional
        de Contratações Públicas (PNCP).
      </p>

      <h2>2. Para que usamos e com qual base legal</h2>
      <ul>
        <li>
          Criar e manter sua conta, encontrar oportunidades e organizar seus
          documentos — <em>execução de contrato</em> (art. 7º, V).
        </li>
        <li>
          Enviar alertas de oportunidades por e-mail — <em>execução de
          contrato</em>, com opção de cancelar a qualquer momento.
        </li>
        <li>
          Enviar o texto dos seus documentos a um provedor de inteligência
          artificial para análise — <em>consentimento</em> (art. 7º, I), pedido
          antes da primeira análise e revogável na página Conta.
        </li>
        <li>
          Segurança, prevenção a abuso e cumprimento de obrigações legais —{" "}
          <em>legítimo interesse</em> e <em>obrigação legal</em> (art. 7º, II
          e IX).
        </li>
      </ul>

      <h2>3. Com quem compartilhamos</h2>
      <p>Usamos operadores que tratam dados em nosso nome, só para prestar o serviço:</p>
      <ul>
        <li><strong>Supabase:</strong> autenticação, banco de dados e armazenamento privado dos documentos.</li>
        <li><strong>Vercel:</strong> hospedagem da aplicação.</li>
        <li><strong>Provedor de inteligência artificial</strong> (API compatível com OpenAI): geração dos vetores de busca, leitura dos editais públicos e, quando você autoriza, análise do texto dos seus documentos.</li>
        <li><strong>Resend:</strong> envio dos e-mails.</li>
      </ul>
      <p>
        Alguns desses fornecedores podem processar dados fora do Brasil; nesses
        casos, a transferência segue o art. 33 da LGPD. Não vendemos dados
        pessoais.
      </p>

      <h2>4. Por quanto tempo guardamos</h2>
      <p>
        Mantemos os dados enquanto sua conta estiver ativa. Ao excluir a conta,
        apagamos perfil, documentos, vínculos e análises. Registros técnicos
        podem ser mantidos pelo prazo exigido em lei.
      </p>

      <h2>5. Seus direitos</h2>
      <p>
        Você pode confirmar o tratamento, acessar e corrigir seus dados, pedir
        portabilidade, revogar consentimentos e pedir a eliminação (art. 18 da
        LGPD). Na página <Link href="/conta">Conta</Link> você consegue, sem
        precisar nos contatar: baixar seus dados, revogar o consentimento de
        análise por IA, cancelar os alertas e excluir a conta.
      </p>

      <h2>6. Segurança</h2>
      <p>
        Os documentos ficam em armazenamento privado, acessível só pela sua
        conta, e o acesso ao banco é restrito por regras de segurança por
        usuário. Nenhum sistema é totalmente imune a incidentes; se algum
        ocorrer, comunicaremos os afetados e a ANPD conforme a lei.
      </p>

      <h2>7. Contato</h2>
      <p>
        Dúvidas ou pedidos sobre privacidade: <ContactLine />. Você também pode
        reclamar à Autoridade Nacional de Proteção de Dados (ANPD).
      </p>
    </LegalPage>
  );
}
