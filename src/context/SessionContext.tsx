import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { DatabaseService } from '../services/DatabaseService';

interface SessionContextType {
    currentTableId: string | null;
    sessionId: string | null;
    sessionStatus: 'OPEN' | 'CLOSED' | 'PAID' | null;
    sessionPin: string | null;
    loading: boolean;
    joinSession: (tableId: string, restaurantId: string) => Promise<boolean>;
    savePin: (pin: string) => void;
    exitSession: () => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const navigate = useNavigate();
    const location = useLocation();

    // State
    const [currentTableId, setCurrentTableId] = useState<string | null>(() => localStorage.getItem('tableId'));
    const [sessionId, setSessionId] = useState<string | null>(() => localStorage.getItem('sessionId'));
    const [sessionPin, setSessionPin] = useState<string | null>(() => localStorage.getItem('sessionPin'));
    const [sessionStatus, setSessionStatus] = useState<'OPEN' | 'CLOSED' | 'PAID' | null>(null);
    const [loading, setLoading] = useState(false);

    // 1. URL Listener & Auto-Logout Logic
    // Detects if the user scans a NEW QR code for a DIFFERENT table
    useEffect(() => {
        // Extract tableId from URL pattern: /client/table/:tableId
        const match = location.pathname.match(/\/client\/table\/([a-f0-9-]+)/i);
        const urlTableId = match ? match[1] : null;

        if (urlTableId && currentTableId && urlTableId !== currentTableId) {
            console.log('Detected Table Switch: Clearing old session');
            exitSession(); // Clear previous session immediately
            // The new component mounting in the route will handle joining the new session
        }
    }, [location.pathname]);

    // 2. Real-time Kick-Out Logic
    // Subscribes to table_sessions updates. If status changes to CLOSED/PAID, kick user out.
    useEffect(() => {
        if (!sessionId) return;

        // Verify session validity on mount (prevent auto-login to closed sessions)
        const checkSessionStatus = async () => {
            try {
                const { data, error } = await supabase
                    .from('table_sessions')
                    .select('status')
                    .eq('id', sessionId)
                    .single();

                if (error) {
                    // RLS or network error - DO NOT clear session data
                    // The PIN and session might still be valid, just can't verify right now
                    console.warn('Session status check failed (RLS/network):', error.message);
                    // Keep session data in localStorage, user stays authenticated
                    return;
                }

                if (!data || data.status === 'CLOSED' || data.status === 'PAID') {
                    console.log('Session confirmed CLOSED/PAID - Logging out');
                    exitSession();
                } else {
                    setSessionStatus(data.status);
                }
            } catch (err) {
                // Network error - preserve session data
                console.warn('Session check network error, preserving session:', err);
            }
        };
        checkSessionStatus();

        const channel = supabase
            .channel(`session_monitor_${sessionId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'table_sessions',
                    filter: `id=eq.${sessionId}`
                },
                (payload) => {
                    if (payload.eventType === 'DELETE') {
                        toast.info('Il tavolo è stato chiuso. Grazie della visita!');
                        exitSession();
                        return;
                    }
                    const newStatus = payload.new?.status;

                    if (newStatus === 'CLOSED' || newStatus === 'PAID') {
                        toast.info('Il tavolo è stato chiuso. Grazie della visita!');
                        exitSession();
                    } else {
                        setSessionStatus(newStatus);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [sessionId, navigate]);


    const joinSession = useCallback(async (tableId: string, restaurantId: string): Promise<boolean> => {
        setLoading(true);
        try {
            // Only join existing open sessions - never create new ones
            // Sessions are created by the restaurant owner from the dashboard
            const { data: openSession, error } = await supabase
                .from('table_sessions')
                .select('id')
                .eq('table_id', tableId)
                .eq('status', 'OPEN')
                .maybeSingle();

            if (error) {
                console.error('Session lookup error:', error);
                if (error.message?.includes('Failed to fetch') || error.code === 'PGRST000') {
                    toast.error('Errore di connessione al server. Verifica la tua connessione internet.');
                } else if (error.message?.includes('ERR_NAME_NOT_RESOLVED')) {
                    toast.error('Server non raggiungibile. Contatta il supporto.');
                } else {
                    toast.error(`Errore: ${error.message || 'Impossibile accedere al tavolo.'}`);
                }
                return false;
            }

            if (openSession) {
                setSessionId(openSession.id);
                setCurrentTableId(tableId);
                setSessionStatus('OPEN');

                // Persist
                localStorage.setItem('tableId', tableId);
                localStorage.setItem('sessionId', openSession.id);
                localStorage.setItem('restaurantId', restaurantId);

                return true;
            }

            // No open session - table not activated yet
            return false;
        } catch (err: any) {
            console.error('Join Session Failed:', err);
            if (err.message?.includes('Failed to fetch') || err.name === 'TypeError') {
                toast.error('Impossibile connettersi al server. Verifica la connessione o contatta il supporto.');
            } else {
                toast.error('Impossibile accedere al tavolo. Riprova.');
            }
            return false;
        } finally {
            setLoading(false);
        }
    }, []);

    const savePin = useCallback((pin: string) => {
        setSessionPin(pin);
        localStorage.setItem('sessionPin', pin);
    }, []);

    const exitSession = useCallback(() => {
        setSessionId(null);
        setCurrentTableId(null);
        setSessionPin(null);
        setSessionStatus(null);
        localStorage.removeItem('tableId');
        localStorage.removeItem('sessionId');
        localStorage.removeItem('restaurantId');
        localStorage.removeItem('sessionPin'); // Clear any legacy keys
    }, []);

    return (
        <SessionContext.Provider value={{ currentTableId, sessionId, sessionPin, sessionStatus, loading, joinSession, savePin, exitSession }}>
            {children}
        </SessionContext.Provider>
    );
};

export const useSession = () => {
    const context = useContext(SessionContext);
    if (context === undefined) {
        throw new Error('useSession must be used within a SessionProvider');
    }
    return context;
};
