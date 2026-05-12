export async function ensureStripeConnectReady(args: {
    stripe: any;
    supabase: any;
    restaurantId: string;
    accountId: string;
}): Promise<{ ok: true } | { ok: false; message: string; needsReconnect?: boolean }> {
    try {
        const account = await args.stripe.accounts.retrieve(args.accountId);
        if (account?.charges_enabled === true) return { ok: true };

        await args.supabase
            .from("restaurants")
            .update({ stripe_connect_enabled: false })
            .eq("id", args.restaurantId)
            .eq("stripe_connect_account_id", args.accountId);

        return {
            ok: false,
            message: "Account Stripe non ancora abilitato a ricevere pagamenti. Completa la configurazione in Impostazioni > Pagamenti.",
        };
    } catch (err: any) {
        console.warn("[Stripe Connect] account non valido, richiedo nuovo collegamento:", err?.message || err);
        await args.supabase
            .from("restaurants")
            .update({ stripe_connect_account_id: null, stripe_connect_enabled: false })
            .eq("id", args.restaurantId)
            .eq("stripe_connect_account_id", args.accountId);

        return {
            ok: false,
            needsReconnect: true,
            message: "Account Stripe da ricollegare in modalità reale: vai in Impostazioni > Pagamenti e premi Collega.",
        };
    }
}
