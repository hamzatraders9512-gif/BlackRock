document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('otpForm');
    const inputs = document.querySelectorAll('.otp-input');
    const resendBtn = document.getElementById('resendBtn');
    const countdownEl = document.getElementById('countdown');
    const userEmailEl = document.getElementById('userEmail');
    const backBtn = document.querySelector('.back-btn');
    
    // Set user's email from URL parameter
    const email = new URLSearchParams(window.location.search).get('email');
    userEmailEl.textContent = email || 'your email';
    
    // Initialize OTP input handling and auto-focus
    initializeOTPInputs(inputs);

    // Initialize the countdown timer for the resend button
    initializeCountdown(resendBtn, countdownEl, 600); // 10 minutes in seconds

    // Handle form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const raw = Array.from(inputs).map(input => input.value.trim()).join('');
        // Server stores OTP as 3-3 with a dash (e.g. 123-456). Format to match.
        let otp = raw;
        if (raw.length === 6) {
            otp = raw.slice(0,3) + '-' + raw.slice(3);
        }

        try {
            const response = await fetch('/api/auth/verify-otp', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, otp })
            });

            const data = await response.json();

            if (response.ok) {
                // Email verified successfully, user logged in. Redirect to dashboard.
                window.location.href = '/dashboard';
            } else {
                showToast(data.message || 'Invalid OTP. Please try again.', 'error');
            }
            } catch (error) {
            console.error('Error:', error);
            showToast('An error occurred. Please try again.', 'error');
        }
    });

    // Handle resend button click
    resendBtn.addEventListener('click', async (e) => {
        if (e.target.disabled) return;
        
        try {
            const response = await fetch('/api/auth/resend-otp', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email })
            });

            const data = await response.json();

            if (response.ok) {
                showToast('New verification code sent!', 'success');
                // Reset countdown timer after successful resend
                initializeCountdown(resendBtn, countdownEl, 600);
            } else {
                showToast(data.message || 'Failed to resend code.', 'error');
            }
            } catch (error) {
            console.error('Error:', error);
            showToast('An error occurred. Please try again.', 'error');
        }
    });

    // Handle back button click
    backBtn.addEventListener('click', () => {
        window.history.back();
    });
});
