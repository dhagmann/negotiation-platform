/**
 * Session Recovery Utility for Research Studies
 * Handles automatic session restoration when socket connection is lost
 */

class SessionRecovery {
    constructor() {
        this.recoveryAttempts = 0;
        this.maxRetries = 3;
        this.recoveryInProgress = false;
    }

    /**
     * Attempt to recover session using workerId
     */
    async attemptRecovery(workerId, participantId = null, socket = null) {
        if (this.recoveryInProgress || this.recoveryAttempts >= this.maxRetries || !socket) {
            return false;
        }

        this.recoveryInProgress = true;
        this.recoveryAttempts++;

        console.log(`🔄 CLIENT: Attempting session recovery (attempt ${this.recoveryAttempts})`);

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this.recoveryInProgress = false;
                resolve(false);
            }, 5000); // 5 second timeout

            const handleSuccess = () => {
                clearTimeout(timeout);
                this.recoveryInProgress = false;
                this.recoveryAttempts = 0; // Reset on success
                socket.off('stateRestored', handleSuccess);
                socket.off('error', handleError);
                console.log('✅ CLIENT: Session recovery successful');
                resolve(true);
            };

            const handleError = (error) => {
                clearTimeout(timeout);
                this.recoveryInProgress = false;
                socket.off('stateRestored', handleSuccess);
                socket.off('error', handleError);
                console.log(`❌ CLIENT: Session recovery failed: ${error}`);
                resolve(false);
            };

            socket.on('stateRestored', handleSuccess);
            socket.on('error', handleError);

            // Emit recovery request
            socket.emit('restoreUserState', {
                workerId: workerId,
                participantId: participantId
            });
        });
    }

    /**
     * Smart error handler that attempts recovery for session-related errors
     */
    async handleError(errorMessage, workerId, participantId = null, socket = null) {
        const isSessionError = errorMessage.includes('Participant not found') || 
                              errorMessage.includes('Session expired') ||
                              errorMessage.includes('user data missing');

        if (isSessionError && this.recoveryAttempts < this.maxRetries) {
            console.log('🔄 CLIENT: Session error detected, attempting recovery...');
            const recovered = await this.attemptRecovery(workerId, participantId, socket);
            
            if (recovered) {
                return {
                    recovered: true,
                    message: 'Session restored. Please try again.'
                };
            } else {
                return {
                    recovered: false,
                    message: 'Session could not be restored. Please refresh the page.'
                };
            }
        }

        return {
            recovered: false,
            message: errorMessage
        };
    }

    /**
     * Reset recovery attempts (call on successful operations)
     */
    reset() {
        this.recoveryAttempts = 0;
        this.recoveryInProgress = false;
    }

    /**
     * Check if recovery is possible
     */
    canRetry() {
        return this.recoveryAttempts < this.maxRetries && !this.recoveryInProgress;
    }
}

// Export singleton instance
export const sessionRecovery = new SessionRecovery();

/**
 * Hook for using session recovery in React components
 */
export const useSessionRecovery = (workerId, participantId = null, socket = null) => {
    const handleErrorWithRecovery = async (errorMessage) => {
        return await sessionRecovery.handleError(errorMessage, workerId, participantId, socket);
    };

    const attemptRecovery = async () => {
        return await sessionRecovery.attemptRecovery(workerId, participantId, socket);
    };

    const resetRecovery = () => {
        sessionRecovery.reset();
    };

    return {
        handleErrorWithRecovery,
        attemptRecovery,
        resetRecovery,
        canRetry: sessionRecovery.canRetry()
    };
};