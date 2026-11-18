-- o custo das peças é visível só para o dono (vendedor não vê)
drop policy "custos: equipe lê" on public.product_costs;
create policy "custos: dono lê" on public.product_costs for select to authenticated using ((select public.is_owner()));
drop policy "estoque: equipe lê" on public.stock_moves;
create policy "estoque: equipe lê" on public.stock_moves for select to authenticated using ((select public.is_staff()));
