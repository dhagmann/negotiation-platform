// Quiz questions for role comprehension check
// Much easier to update than CSV files!

export const quizQuestions = {
  optimisticBuyer: [
    {
      question: "1. What are you negotiating for in this task?",
      options: [
        "A) The sale of a battery unit",
        "B) The sale of an antique watch", 
        "C) The sale of a patent for a lifesaving drug",
        "D) The sale of a large country estate"
      ],
      correct: "A) The sale of a battery unit",
      required: true
    },
    {
      question: "2. What happens if you cannot reach an agreement?",
      options: [
        "A) You will not earn a bonus payment",
        "B) Your bonus payment will be determined by what a third party would offer",
        "C) You will get a fixed bonus of $1", 
        "D) There is no bonus in this task"
      ],
      correct: "B) Your bonus payment will be determined by what a third party would offer",
      required: true
    },
    {
      question: "3. What was the consultant's estimate for what another party would offer you if you cannot reach an agreement?",
      options: [
        "A) $2.0m",
        "B) $2.5m",
        "C) $3.0m",
        "D) $3.5m"
      ],
      correct: "B) $2.5m",
      required: true
    }
  ],

  optimisticSeller: [
    {
      question: "1. What are you negotiating for in this task?",
      options: [
        "A) The sale of a battery unit",
        "B) The sale of an antique watch",
        "C) The sale of a patent for a lifesaving drug", 
        "D) The sale of a large country estate"
      ],
      correct: "A) The sale of a battery unit",
      required: true
    },
    {
      question: "2. What happens if you cannot reach an agreement?",
      options: [
        "A) You will not earn a bonus payment",
        "B) Your bonus payment will be determined by what a third party would offer",
        "C) You will get a fixed bonus of $1",
        "D) There is no bonus in this task"
      ],
      correct: "B) Your bonus payment will be determined by what a third party would offer", 
      required: true
    },
    {
      question: "3. What was the consultant's estimate for what another party would offer you if you cannot reach an agreement?",
      options: [
        "A) $2.0m",
        "B) $2.5m", 
        "C) $3.0m",
        "D) $3.5m"
      ],
      correct: "C) $3.0m",
      required: true
    }
  ],

  pessimisticBuyer: [
    {
      question: "1. What are you negotiating for in this task?",
      options: [
        "A) The sale of a battery unit",
        "B) The sale of an antique watch",
        "C) The sale of a patent for a lifesaving drug",
        "D) The sale of a large country estate"
      ],
      correct: "A) The sale of a battery unit",
      required: true
    },
    {
      question: "2. What happens if you cannot reach an agreement?",
      options: [
        "A) You will not earn a bonus payment",
        "B) Your bonus payment will be determined by what a third party would offer",
        "C) You will get a fixed bonus of $1",
        "D) There is no bonus in this task"
      ],
      correct: "B) Your bonus payment will be determined by what a third party would offer",
      required: true
    },
    {
      question: "3. What was the consultant's estimate for what another party would offer you if you cannot reach an agreement?",
      options: [
        "A) $2.0m",
        "B) $2.5m",
        "C) $3.0m", 
        "D) $3.5m"
      ],
      correct: "D) $3.5m",
      required: true
    }
  ],

  pessimisticSeller: [
    {
      question: "1. What are you negotiating for in this task?",
      options: [
        "A) The sale of a battery unit",
        "B) The sale of an antique watch",
        "C) The sale of a patent for a lifesaving drug",
        "D) The sale of a large country estate"
      ],
      correct: "A) The sale of a battery unit",
      required: true
    },
    {
      question: "2. What happens if you cannot reach an agreement?",
      options: [
        "A) You will not earn a bonus payment", 
        "B) Your bonus payment will be determined by what a third party would offer",
        "C) You will get a fixed bonus of $1",
        "D) There is no bonus in this task"
      ],
      correct: "B) Your bonus payment will be determined by what a third party would offer",
      required: true
    },
    {
      question: "3. What was the consultant's estimate for what another party would offer you if you cannot reach an agreement?",
      options: [
        "A) $2.0m",
        "B) $2.5m",
        "C) $3.0m",
        "D) $3.5m"
      ],
      correct: "A) $2.0m",
      required: true
    }
  ]
};

// Helper function to get questions for a specific role
export const getQuizForRole = (role) => {
  return quizQuestions[role] || [];
};

// Helper function to validate answers
export const validateQuizAnswers = (role, answers) => {
  const questions = getQuizForRole(role);
  let correctCount = 0;
  let allCorrect = true;
  
  questions.forEach((question, index) => {
    if (question.required && answers[index] === question.correct) {
      correctCount++;
    } else if (question.required) {
      allCorrect = false;
    }
  });
  
  return {
    score: correctCount,
    totalQuestions: questions.length,
    passed: allCorrect,
    correctAnswers: questions.map(q => q.correct)
  };
}; 