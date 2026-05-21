import React, { useState, useRef, useEffect } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase'; 

export default function FloatingChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { sender: 'ai', text: '안녕하세요! 스마트 도서관 AI 사서입니다. 🤖\n자리 예약, 이용 수칙, 불편 신고 및 소명 등 어떤 문제든 말씀해 주시면 제가 직접 해결해 드리겠습니다!' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  // 💡 챗봇이 "사연/신고"를 기다리는 상태인지 기억하는 스위치
  const [isWaitingForAppeal, setIsWaitingForAppeal] = useState(false);
  
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => { scrollToBottom(); }, [messages, isTyping]);

  const handleSend = () => {
    if (!input.trim()) return;

    const userMsg = input;
    setMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
    setInput('');
    setIsTyping(true);

    setTimeout(async () => {
      let aiResponse = "";

      // =================================================================
      // 💡 1. 챗봇이 "사연/신고"를 기다리고 있던 상태 (DB 저장 및 담당자 전달 완료)
      // =================================================================
      if (isWaitingForAppeal) {
        try {
          const currentUser = auth.currentUser ? auth.currentUser.email : '익명 사용자';
          await addDoc(collection(db, 'Appeals'), {
            content: userMsg,
            userId: currentUser,
            status: 'PENDING', 
            createdAt: serverTimestamp()
          });
          
          // 💡 [수정] AI가 확실하게 자기가 담당자에게 전달했다고 듬직하게 말해줍니다.
          aiResponse = "✅ 접수가 완료되었습니다!\n남겨주신 상세 내용은 **제가 지금 바로 담당자님께 다이렉트로 전달했습니다.** 꼼꼼히 확인 후 신속하게 조치 및 안내해 드릴 테니 너무 걱정하지 마세요! 제가 끝까지 책임지고 돕겠습니다. 🤖💪";
        } catch (error) {
          console.error("접수 에러:", error);
          aiResponse = "앗, 시스템 통신 중 오류가 발생했어요. 잠시 후 다시 시도해 주시겠어요?";
        }
        
        setIsWaitingForAppeal(false);
      } 
      // =================================================================
      // 💡 2. 일반 대화 모드일 때의 로직 (방안 안내 + AI가 직접 해결)
      // =================================================================
      else {
        aiResponse = "죄송합니다. 제가 아직 학습 중이라 정확히 이해하지 못했어요. 😢\n혹시 예약 문의, 불편 신고, 패널티 소명 중 어떤 문제이신가요?";
        
        // 💡 [수정] 소명/억울함 호소 시 -> AI가 직접 해결하겠다고 나섬
        if (userMsg.includes("소명") || userMsg.includes("억울") || userMsg.includes("노쇼") || userMsg.includes("경고") || userMsg.includes("신고 당") || userMsg.includes("신고 및 소명")) {
          aiResponse = "패널티 조치나 신고로 많이 당황하셨겠어요. 😢\n번거롭게 직접 메뉴를 찾으실 필요 없이, **제가 바로 소명 접수를 도와드리고 담당자에게 즉시 전달해 드리겠습니다.**\n빠른 처리를 위해 아래 양식에 맞춰 사연을 적어주시겠어요?\n\n[접수 양식]\n- 이름 :\n- 학번(아이디) :\n- 발생한 좌석 번호 :\n- 발생 시간 :\n- 사유 :";
          setIsWaitingForAppeal(true); 
        } 
        // 💡 [수정] 빌런(치킨/소음) 신고 시 -> AI가 직접 전달하겠다고 나섬
        else if (userMsg.includes("치킨") || userMsg.includes("음식") || userMsg.includes("시끄") || userMsg.includes("떠들") || userMsg.includes("신고할") || userMsg.includes("신고")) {
          aiResponse = "도서관 이용에 불편을 드려 죄송합니다! 🚨\n기본적으로 [마이페이지]에서도 신고가 가능하지만, **지금 이 채팅창에 발생한 [좌석 번호]와 [상황]을 적어주시면 제가 즉시 담당자에게 보고하여 즉각 조치하도록 하겠습니다.** 내용 남겨주시겠어요?";
          setIsWaitingForAppeal(true);
        } 
        // 💡 [수정] 일반 시스템 문의 시 -> 방안 안내 + 해결 안 되면 도와준다고 덧붙임
        else if (userMsg.includes("예약") || userMsg.includes("시간") || userMsg.includes("몇")) {
          aiResponse = "도서관의 1회 최대 예약 가능 시간은 2시간입니다. ⏰\n이용 시간 종료 30분 전부터 앱 메인 화면에서 연장 신청이 가능합니다.\n\n혹시 앱 사용이 어려우시거나 시스템에 문제가 있다면 편하게 말씀해 주세요. **제가 직접 담당자에게 전달해서 예약 관련 문제를 해결해 드리겠습니다!**";
        } else if (userMsg.includes("안녕") || userMsg.includes("반가")) {
          aiResponse = "반갑습니다! 오늘도 스마트 도서관을 찾아주셔서 감사해요. 📚 무엇을 해결해 드릴까요?";
        }
      }

      setMessages(prev => [...prev, { sender: 'ai', text: aiResponse }]);
      setIsTyping(false);
    }, 1500); 
  };

  return (
    <div style={{ position: 'fixed', bottom: '30px', right: '30px', zIndex: 999999 }}>
      
      {/* 챗봇 대화창 */}
      {isOpen && (
        <div style={{ width: '380px', height: '550px', background: '#fff', borderRadius: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', overflow: 'hidden', marginBottom: '15px', border: '1px solid #e2e8f0' }}>
          
          {/* 헤더 */}
          <div style={{ background: '#2563eb', padding: '16px 20px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.8rem' }}>🤖</span>
              <div>
                <h4 style={{ margin: 0, fontWeight: 900, fontSize: '1.1rem' }}>스마트 도서관 AI</h4>
                <p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.8 }}>시연용 스마트 해결사</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer', padding: 0 }}>✕</button>
          </div>

          {/* 대화 내용 영역 */}
          <div style={{ flex: 1, padding: '20px', overflowY: 'auto', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {messages.map((msg, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '80%', padding: '12px 16px', borderRadius: '16px', fontSize: '0.95rem', lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'keep-all',
                  background: msg.sender === 'user' ? '#2563eb' : '#fff',
                  color: msg.sender === 'user' ? '#fff' : '#334155',
                  boxShadow: msg.sender === 'user' ? 'none' : '0 2px 5px rgba(0,0,0,0.05)',
                  border: msg.sender === 'user' ? 'none' : '1px solid #e2e8f0',
                  borderBottomRightRadius: msg.sender === 'user' ? '4px' : '16px',
                  borderBottomLeftRadius: msg.sender === 'ai' ? '4px' : '16px',
                }}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isTyping && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ background: '#fff', padding: '10px 14px', borderRadius: '16px', borderBottomLeftRadius: '4px', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '0.85rem' }}>
                  AI가 해결 방안을 고민 중입니다... 🤔
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 텍스트 입력창 */}
          <div style={{ padding: '15px', background: '#fff', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '10px' }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder={isWaitingForAppeal ? "상세 내용을 자세히 적어주세요!" : "궁금한 점을 물어보세요!"}
              style={{ flex: 1, padding: '12px 16px', borderRadius: '12px', border: '1px solid #cbd5e1', outline: 'none', background: '#f1f5f9', fontSize: '0.9rem', borderColor: isWaitingForAppeal ? '#3b82f6' : '#cbd5e1' }}
            />
            <button onClick={handleSend} disabled={isTyping} style={{ background: isTyping ? '#94a3b8' : '#2563eb', color: '#fff', border: 'none', borderRadius: '12px', padding: '0 16px', fontWeight: 900, cursor: isTyping ? 'not-allowed' : 'pointer', transition: '0.2s', whiteSpace: 'nowrap' }}>
              전송
            </button>
          </div>
        </div>
      )}

      {/* 둥근 플로팅 챗봇 열기 버튼 */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          style={{
            width: '65px', height: '65px', borderRadius: '50%', background: '#2563eb', border: 'none', color: '#fff', fontSize: '2rem', cursor: 'pointer',
            boxShadow: '0 10px 25px rgba(37,99,235,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', transition: 'transform 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          💬
        </button>
      )}
    </div>
  );
}