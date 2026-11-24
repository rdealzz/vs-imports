-- Categorias da loja real (importadas de vsimpoorts.com.br)
alter table public.products drop constraint products_category_check;
alter table public.products add constraint products_category_check check (category = any (array['camisetas','polos','bermudas','calcas','inverno','conjuntos','bones','calcados','acessorios','tenis']));
