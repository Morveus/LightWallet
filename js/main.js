$('#start-btn').click(function(){
	$('#start-btn').click(false);
	$('.main-page').slideUp(1000, function(){
		waitForDongle();
	});
});