import type { Metadata } from "next";
import Link from "next/link";
import { ContactLine, LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Termos de Uso | peneir.IA",
  description: "Condições de uso da peneir.IA.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Termos de Uso" updatedAt="7 de novembro de 2026">
      <p>
        Ao criar uma conta na peneir.IA, você concorda com estes termos e com
        a <Link href="/privacidade">Política de Privacidade</Link>.
      </p>

      <h2>1. O serviço</h2>
      <p>
        A peneir.IA reúne licitações públicas do Portal Nacional de
        Contratações Públicas (PNCP), sugere as compatíveis com o perfil que
        você descreve, ajuda a organizar documentos e oferece leituras e
        análises feitas por inteligência artificial.
      </p>

      <h2>2. Limites das informações e da IA</h2>
      <ul>
        <li>
          Os dados das licitações vêm do PNCP e podem estar incompletos,
          desatualizados ou ser alterados pelo órgão responsável.
        </li>
        <li>
          Resumos de editais, listas de documentos exigidos, percentuais de
          similaridade e análises de documentos são gerados automaticamente e
          podem conter erros ou omissões. Eles não constituem parecer jurídico
          nem garantem habilitação ou contratação.
        </li>
        <li>
          Você é responsável por conferir o edital oficial, seus anexos e
          prazos antes de decidir participar ou enviar uma proposta.
        </li>
      </ul>

      <h2>3. Sua conta e seus documentos</h2>
      <ul>
        <li>Mantenha seus dados de acesso em sigilo e informe dados verdadeiros.</li>
        <li>
          Envie apenas documentos que você tem direito de usar. Você continua
          titular dos seus documentos; nós os usamos apenas para prestar o
          serviço.
        </li>
        <li>
          Não use o serviço para atividades ilícitas, para tentar acessar dados
          de outros usuários ou para sobrecarregar a plataforma.
        </li>
      </ul>

      <h2>4. Disponibilidade</h2>
      <p>
        O serviço depende de fontes e fornecedores externos (como o PNCP) e
        pode ter interrupções. Podemos alterar ou encerrar funcionalidades,
        avisando com antecedência quando houver impacto relevante.
      </p>

      <h2>5. Encerramento</h2>
      <p>
        Você pode excluir sua conta a qualquer momento na página{" "}
        <Link href="/conta">Conta</Link>. Podemos suspender contas que violem
        estes termos.
      </p>

      <h2>6. Alterações e contato</h2>
      <p>
        Avisaremos sobre mudanças relevantes nestes termos. Dúvidas: <ContactLine />.
        Aplica-se a legislação brasileira.
      </p>
    </LegalPage>
  );
}
