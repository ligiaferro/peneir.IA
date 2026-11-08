-- Concursos, doutorado e bolsas deixaram de ser oferecidos por ora: limpa essas
-- categorias dos perfis. As constraints antigas continuam aceitando os valores
-- (nenhuma oportunidade é gravada com eles), o que permite reativá-los depois.
update public.profiles
set categories = coalesce(
  (select array_agg(category) from unnest(categories) as category where category = 'licitacoes'),
  '{}'
)
where exists (
  select 1 from unnest(categories) as category where category <> 'licitacoes'
);
