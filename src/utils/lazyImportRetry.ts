import { lazy, ComponentType } from 'react';

const CHUNK_RELOAD_KEY = 'minthi_chunk_reload_once';

const isModuleLoadError = (error: any): boolean => {
    const message = String(error?.message || error || '').toLowerCase();
    const name = String(error?.name || '').toLowerCase();

    return (
        name === 'chunkloaderror' ||
        message.includes('failed to fetch dynamically imported module') ||
        message.includes('error loading dynamically imported module') ||
        message.includes('importing a module script failed') ||
        message.includes('dynamically imported module') ||
        message.includes('not a valid javascript mime type') ||
        message.includes('expected a javascript module script') ||
        (message.includes('text/html') && message.includes('module'))
    );
};

const reloadOnceForFreshAssets = () => {
    const storageKey = `${CHUNK_RELOAD_KEY}:${window.location.pathname}`;
    const hasRetried = sessionStorage.getItem(storageKey);

    if (hasRetried) {
        sessionStorage.removeItem(storageKey);
        return false;
    }

    sessionStorage.setItem(storageKey, 'true');
    const url = new URL(window.location.href);
    url.searchParams.set('_v', Date.now().toString());
    window.location.replace(url.toString());
    return true;
};

export const recoverFromModuleLoadError = (error: any): boolean => {
    if (!isModuleLoadError(error)) return false;
    return reloadOnceForFreshAssets();
};

/**
 * A wrapper for React.lazy that reloads the page once if the module fails to load.
 * This handles stale chunks after a deployment, including when the host returns
 * index.html for an old JS file and the browser reports a text/html MIME error.
 */
export const lazyImportRetry = <T extends ComponentType<any>>(
    factory: () => Promise<{ default: T }>
) => {
    return lazy(async () => {
        try {
            return await factory();
        } catch (error: any) {
            if (recoverFromModuleLoadError(error)) {
                // Return a never-resolving promise to wait for reload
                return new Promise(() => { });
            }

            throw error;
        }
    });
};
