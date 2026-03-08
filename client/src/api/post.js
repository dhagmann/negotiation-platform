import axios from 'axios';

const serverUrl = process.env.REACT_APP_SERVER_URL || window.location.origin;

export const saveOffer = async (
  sender_participant_id,
  recipient_participant_id,
  offer_amount,
  status) => {
  try {
    const response = await axios.post(`${serverUrl}/save-negotiation-offer`, { 
      sender_participant_id,
      recipient_participant_id,
      offer_amount,
      status
    });
    return response
  } catch (error) {
    console.error('Failed to save offer:', error.response?.data?.error || error.message);
    return error 
  }
};
